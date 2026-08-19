# Diagnose — Windpartikel: kein Schweif, keine lesbare Strömung

> Auftrag (Jan, 2026-08-08): „Die Windpartikel haben keinen großen Schweif, sodass es dem
> Anwender schwerfällt, die Windrichtung zu erkennen. Zudem lassen sich für ihn keine
> Strömungen erkennen, da die Partikel im kleinsten Raum verschiedene Richtungen haben."
> Referenzbild: `referenze_windpartikel.PNG` (WetterOnline-artige Kometenstriche).
>
> Status: **Diagnose abgeschlossen, Umsetzung offen** — der eigentliche Fix ist eine
> Shader-Änderung und damit **STOPP & FRAGEN**.

## 0. Kurzfassung

Der Schweif ist nicht „zu kurz eingestellt", er ist **halb so lang wie dokumentiert** — ein
Rechenfehler im Trail-Komposit lässt die Spur **quadratisch statt linear** ausbleichen. Bei der
heutigen Windlage (Median 2,2 m/s) bleibt davon ein **~10 px langer Schmier** an einem 2,7 px
großen runden Punkt übrig: optisch ein Punkt, keine Richtung.

Der zweite Befund („verschiedene Richtungen im kleinsten Raum") ist **kein Datenproblem**. Das
Windfeld ist in der Fläche sehr einheitlich (Richtungsstreuung 2,7–7,4° auf 0,3°-Kästen, s. §3).
Was der Anwender sieht, ist die Folge des ersten Befunds: Ohne sichtbaren Schweif bleibt ein Feld
aus **runden, richtungslosen Punkten** — und ein Punktfeld liest sich immer als Rauschen.

## 1. Messaufbau

Desktop 1440×900, Chrome DevTools MCP, Dev-Server `:5199`, Kartenausschnitt Nordseeküste
(8,5° O / 53,5° N), Zoom 8, Layer `wind` allein aktiv, Regler „Normal".
Live-Werte aus `__map.style._layers.wind.implementation`, Bewegung aus der eingebauten Sonde
`windMotionDiag`, Windwahrheit aus `__bsSample.wind`.

| Größe | gemessen |
|---|---|
| Partikelzahl (gezeichnet) | 1 755 von 2 025 |
| `fadeOpacity` | 0,972 |
| `pointSize` (× Zoomfaktor 1,9) | 2,5 → ~4,7 px Framebuffer, ~2,7 px sichtbarer Kern |
| Schirmtempo (`cssPxPerSec`) | **14,3 px/s** |
| gemessene Bildrate | 64,1 fps |
| Windtextur-Format | `byte` (kein Half-Float auf diesem Stack) |
| Windgeschwindigkeit im Bild | Min 0,98 · **Median 2,24** · p75 3,05 · p90 5,08 · Max 6,18 m/s |

## 2. Befund A — der Schweif bleicht quadratisch statt linear aus

Die Spur entsteht in `WindLayer.drawScreen()`: der Trail-Puffer des Vorframes wird mit
`fadeOpacity` abgedunkelt, die Köpfe werden daraufgemalt, das Ergebnis wird in den Karten-Puffer
komponiert. Zwei Stellen multiplizieren dabei **dieselbe** Deckkraft:

1. `screenFrag` (`src/wind/shaders.ts`) blendet **alle vier Kanäle** ab:
   `gl_FragColor = vec4(floor(255.0 * color * u_opacity) / 255.0);`
   — also auch RGB, nicht nur Alpha.
2. Das Komposit (`drawScreen` → `drawTexture(screenTexture, 1.0)`) blendet mit
   `SRC_ALPHA / ONE_MINUS_SRC_ALPHA`, multipliziert die Farbe also **noch einmal** mit dem
   inzwischen ebenfalls abgeblendeten Alpha.

Die Köpfe werden mit `BLEND` **aus** in den Trail-Puffer geschrieben (`drawParticles`, Points-Pfad),
d. h. der Puffer enthält RGB = 1,0 und A = 0,85. Nach n Frames steht dort
`rgb = 0,972ⁿ`, `a = 0,85 · 0,972ⁿ`; sichtbar wird `rgb · a = 0,85 · 0,972²ⁿ`.

**Die wirksame Abblendrate ist also 0,972² = 0,9448 je Frame — der Schweif ist auf die Hälfte der
dokumentierten Lebensdauer verkürzt.** Der Kommentar in `src/MapView.tsx:3594` („0,972 ⇒ ~36 Frames
⇒ ~22-px-Strich, die Kometenform der Vorlage") beschreibt damit einen Zustand, den der Code nicht
herstellt.

Sichtbare Schweiflänge (Schwelle: 10 % der Kopfhelligkeit, Abblendung ist wanduhr-normiert über
`frameDtScale`, daher bildratenunabhängig):

| `fadeOpacity` | wirksam je Frame | sichtbare Dauer | Länge bei 2,2 m/s (Median) | bei 5 m/s (p90) |
|---|---|---|---|---|
| **0,972 (IST)** | 0,9448 | 0,68 s | **~10 px** | ~22 px |
| 0,986 (= √0,972) | 0,9722 | 1,35 s | ~19 px | ~44 px |
| 0,991 | 0,9821 | 2,12 s | ~30 px | ~69 px |
| 0,972 **nach Fix** | 0,972 | 1,35 s | ~19 px | ~44 px |

Zum Vergleich: der sichtbare Punktkern misst ~2,7 px. Bei 10 px Spur ist das Verhältnis 3,6 : 1 —
zu wenig, um daraus eine Richtung zu lesen. Ab ~19 px wird es ein Strich.

**Gegenprobe an der laufenden Karte** (reine Laufzeit-Parameter, kein Code geändert):

| Bild | Einstellung | Ergebnis |
|---|---|---|
| `screenshots/windpartikel-schweif/01-ist-fade-0972.png` | IST | reines Punktfeld, kein Strich erkennbar |
| `screenshots/windpartikel-schweif/02-kandidat-fade-0986.png` | fade 0,986 | über See (3–6 m/s) klare, parallele Kometenstriche; über Land (< 2 m/s) weiter Punkte |
| `screenshots/windpartikel-schweif/03-kandidat-fade-0991-dichte-055.png` | fade 0,991 · Dichte ×0,55 · Punkt 2,2 | dem Referenzbild am nächsten: lange, saubere Striche, ruhiges Bild |

## 3. Befund B — „verschiedene Richtungen im kleinsten Raum" ist ein Darstellungs-, kein Datenbefund

Richtungsstreuung des Windfelds in 0,3°-Kästen (12 × 12 Stützstellen, zirkuläre Statistik):

| Kasten | Median-Wind | mittlere Richtung | zirkuläre Streuung | max. Abweichung |
|---|---|---|---|---|
| Nordsee (7,8 / 54,2) | 3,68 m/s | −151,3° | **6,3°** | 14,4° |
| Küste (8,5 / 53,6) | 2,94 m/s | −142,6° | **2,7°** | 7,6° |
| Binnenland (8,6 / 52,9) | 2,40 m/s | −174,2° | **7,4°** | 14,0° |

Das Feld ist also über ~20–30 km praktisch richtungsgleich. Auch die Advektion selbst ist in
Ordnung: die frühere Faktor-2-Anisotropie ist behoben (`NS_ASPECT = 2` steht in `updateFrag`
**und** `segDrawVert`), die Position wird bounds-relativ kodiert, das Rasterquantum beträgt im
Messausschnitt 2,8 m — die früher notierten Befunde **V-172/V-174/V-175 sind am Code bereits
erledigt**, ihre Einträge in `improvements.md` sind veraltet (s. §6).

Was bleibt, ist die Optik: Ein Partikel ohne Schweif ist ein **runder, weicher Punkt**
(`drawFrag`: radialer `smoothstep`-Abfall) — eine Form ohne jede Vorzugsrichtung. 1 755 solcher
Punkte lesen sich als Streuung. Sobald der Schweif zurück ist (Bild 02/03), ordnet sich dasselbe
Partikelfeld sichtbar zu parallelen Bahnen.

## 4. Abstand zum Referenzbild

`referenze_windpartikel.PNG` (Ausschnitt Coburg/Schweinfurt, schwachwindige Lage) zeigt:

- **gleich lange** Striche, ~15–25 px, unabhängig von der lokalen Windstärke,
- heller Kopf mit weichem Auslauf nach hinten (Kometenform),
- geringe Dichte (~1 Strich je 65 × 65 px), dadurch ein ruhiges Bild,
- durchweg parallele Ausrichtung.

buscosun bildet die Schweiflänge bewusst **proportional zur Windstärke** ab (Länge = Tempo ×
Lebensdauer) — das ist ein Ehrlichkeits-Merkmal: der lange Strich *bedeutet* viel Wind. Das
Referenzbild verzichtet darauf zugunsten gleichförmiger Lesbarkeit. **Diese Abwägung ist eine
Produktentscheidung und liegt bei Jan** (s. §5, Frage 2).

Mit Fix bzw. angehobenem `fadeOpacity` erreicht buscosun bei ≥ 2 m/s die Strichlänge der Vorlage;
darunter (heute 25 % der Fläche im Messausschnitt, deutschlandweit typischerweise mehr) bleibt der
Strich kürzer als in der Vorlage — er zeigt dann korrekt an, dass dort kaum Wind weht.

## 5. Vorschlag — drei Hebel, aufsteigend nach Eingriffstiefe

**H1 — Parameter (kein Shader, keine Freigabe nötig).**
`fadeOpacity` von 0,972/0,982 auf **0,986/0,991** anheben (√-Kompensation des quadratischen
Ausbleichens), `MapView.tsx:3598`. Eine Zeile, sofort wirksam, keine Pipeline-Berührung. Nachteil:
kaschiert den Rechenfehler, statt ihn zu beheben — der Kommentar bliebe unwahr, und der Schweif
bleicht in der Mitte weiterhin schneller aus als am Anfang (was optisch allerdings *näher* an der
Kometenform der Vorlage liegt als eine lineare Abblendung).

**H2 — Ursache beheben (Shader, STOPP & FRAGEN).**
In `screenFrag` nur noch den **Alpha-Kanal** abblenden:
`gl_FragColor = vec4(color.rgb, floor(255.0 * color.a * u_opacity) / 255.0);`
Danach bedeutet `fadeOpacity` wieder genau das, was dokumentiert ist; 0,972 liefert die
beschriebenen ~36 Frames / ~19–22 px, ganz ohne Zahlenänderung in `MapView.tsx`. Ein Vier-Wort-Diff,
aber Rendering-Pipeline → Freigabe erforderlich. Verifikation: `windMotionDiag` (Tempo unverändert)
+ Screenshot-Paar + Desktop-Regressionsblick auf Globus (`GlobeMap.tsx` nutzt denselben Shader mit
`fadeOpacity: 0.97`).

**H3 — Strichform wie die Vorlage (größerer Eingriff, Freigabe erforderlich).**
Gleich lange Striche unabhängig vom Wind. Der Code dafür existiert bereits: der WP1-Segment-Stil
(`particleStyle: 'segments'`, `src/wind/particlePreset.ts`), am 2026-08-08 auf Jans Auftrag wieder
deaktiviert („Optik gefiel nicht"). Alternative ohne Segmente: eine Mindest-Schweiflänge über eine
windabhängige Lebensdauer. **Beides bricht die Proportionalität Länge ↔ Windstärke** und wäre in
der Layer-Beschreibung auszuweisen.

**Empfehlung:** H2 (Ursache) — und erst danach entscheiden, ob überhaupt noch H1/H3 nötig ist. H2
allein stellt die dokumentierte Optik her, ändert kein einziges Parameterversprechen und ist der
kleinste Eingriff mit dem größten Effekt.

## 6. Nebenbefund — veraltete Einträge in `improvements.md`

`V-172`, `V-174` und `V-175` beschreiben Zustände, die der Code **nicht mehr** aufweist
(bounds-relative Kodierung und `NS_ASPECT` sind umgesetzt; Rasterquantum im Messausschnitt 2,8 m
statt der dort genannten 16–65 px). Sie stehen weiter als „offen, Freigabe fehlt" im Katalog und
führen jede spätere Sitzung in die Irre. Vorschlag: als **erledigt** markieren mit Verweis auf
diese Messung. (Eigener Eintrag, s. `improvements.md`.)

## 7. Umsetzung — H2, freigegeben von Jan am 2026-08-08

**Diff:** eine Anweisung in `src/wind/shaders.ts` (`screenFrag`).

```glsl
// vorher
gl_FragColor = vec4(floor(255.0 * color * u_opacity) / 255.0);
// nachher
gl_FragColor = vec4(color.rgb, floor(255.0 * color.a * u_opacity) / 255.0);
```

Sonst nichts: keine Zahl in `MapView.tsx`, kein Parameter, kein zweiter Pfad, kein neues Uniform.
`fadeOpacity` bleibt bei 0,972 („Normal") bzw. 0,982 („Intensiv") — beide bedeuten jetzt das, was
sie immer behauptet haben.

Warum das den Komposit-Pass nicht anfasst: `screenFrag` bedient **beide** Aufrufe von
`drawTexture`. Beim Komposit ist `u_opacity = 1,0`; dort ist `floor(255·a)/255` die Identität auf
einem Wert, der ohnehin aus einer 8-Bit-Textur stammt, und `rgb` geht unverändert durch (vorher
wurde es dort ebenfalls nur auf sich selbst gerundet). Das `floor()` bleibt auf dem Alpha-Kanal
stehen, damit die Spur weiterhin **endet**, statt asymptotisch weiterzuleben.

### Verifikation (Desktop 1440×900, Chrome DevTools MCP, 2026-08-08 22:31–22:37 MESZ)

| Prüfung | Ergebnis | Beleg |
|---|---|---|
| Schweif bei unveränderten 0,972 | über See (3–6 m/s) klare, parallele Kometenstriche statt Punktfeld | `04-nach-h2-fade-0972.png` |
| Vorhersage bestätigt | Bild 04 (0,972 **mit Fix**) entspricht Bild 02 (0,986 **ohne Fix**) — genau die vorhergesagte √-Beziehung | 02 ↔ 04 |
| **Partikel-Physik unverändert** | `cssPxPerSec` **14,3 → 14,4** (gleiches Windfeld, ~1 % Messrauschen), `screenTempoGain` 6, `stalledPct` 0 | `windMotionDiag`, §1 |
| Framebuffer | `fb_background`/`fb_screen`/`fb_particleState` alle `COMPLETE` | `glDiag` |
| Regler „Intensiv" (0,982) | wirkt jetzt spürbar — vorher effektiv 0,964, also kaum vom Normalwert unterscheidbar | `07-intensiv-nach-h2.png` |
| Globus (`GlobeMap.tsx`, derselbe Shader, `fadeOpacity: 0.97`) | lange, saubere Strömungsfäden, keine Störung | `05-globus-nach-h2.png` |
| Mobil 390×844 | identisches Verhalten, keine Layout-/Layer-Regression | `08-mobil-390x844-nach-h2.png` |
| Konsole (Karte, Desktop **und** mobil) | sauber, 0 Fehler / 0 Warnungen | — |
| `npm run typecheck` | grün | — |

**Bewusste, freigegebene Optik-Änderung:** Die Karte sieht am Wind-Layer anders aus als vorher —
das *ist* der Auftrag. Alles andere (Basemap, übrige Layer, Bedienelemente, Heatmap) bleibt
unberührt: der Diff liegt ausschließlich im Fragment-Shader des Trail-Puffers.

**Zwei ehrliche Einschränkungen:**

1. **Schwachwind bleibt kurz.** Am DACH-Überblick (z5,3) mit der Lage dieser Nacht (1–2,5 m/s über
   Deutschland) ist der Gewinn klein — 6–15 px Strich (`06-uebersicht-z53-nach-h2.png`). Das ist
   die gewollte Folge von „Länge = Windstärke" (Jans Entscheidung vom 2026-08-08). Wer dort mehr
   Strich will, hat den Regler „Intensiv".
2. **Auf dem Globus** erscheint eine Konsolen-Warnung von Chrome
   („READ-usage buffer was written, then fenced…", 171×). Sie stammt aus dem GFS-Readback-Pfad des
   Globus, nicht aus dem Trail-Puffer (diese Änderung liest nichts zurück) — ein Vorher-Vergleich
   auf der Globus-Seite wurde allerdings **nicht** gemessen, die Einordnung ist also hergeleitet,
   nicht belegt. Als eigener Punkt notiert.

---

**Belege:** `audit/screenshots/windpartikel-schweif/01…08`, Messwerte in §1–§3 und §7 (Chrome
DevTools MCP, Desktop 1440×900 + mobil 390×844, 2026-08-08 22:15–22:37 MESZ).
