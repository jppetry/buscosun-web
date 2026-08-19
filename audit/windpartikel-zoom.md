# Diagnose — Windpartikel beim Zoomen: Schweif, Partikelzahl, Gestenverhalten

> Auftrag (Jan, 2026-08-08, direkt nach Phase WS1): „Was noch nicht so gut funktioniert, ist das
> Reinzoomen und Rauszoomen. Und schaue, dass die Windpartikel-Schweife auch beim Reinzoomen zu
> erkennen sind und dass die Windpartikel von der Anzahl nie zu viel oder zu wenig sind."
>
> Status: **alle drei Befunde umgesetzt und verifiziert.** Z-B/Z-C ohne Pipeline-Berührung,
> Z-A (Trail-Nachführung) nach STOPP & FRAGEN mit Jans Freigabe vom 2026-08-08.

## 0. Kurzfassung

Drei getrennte Defekte, alle gemessen:

| | Befund | Eingriff |
|---|---|---|
| **Z-A** | Der Trail-Puffer wird bei **jedem Kamerabild** verworfen. Während einer 3-s-Zoomfahrt: **173 Löschungen in 189 Bildern.** Solange die Geste läuft, gibt es keinen Schweif — nur Punkte; danach baut er sich über ~1,4 s neu auf. | **umgesetzt** (ZA-1, Freigabe Jan 2026-08-08) |
| **Z-B** | Der Partikel-**Kopf** wuchs mit dem Zoom um Faktor 4 (2,1 px → 8,5 px), die Schweif**länge** ist zoom-unabhängig. Verhältnis Schweif : Kopf fiel von 9 : 1 auf **2,2 : 1** — aus dem Strich wurde wieder ein Klecks. | **umgesetzt** |
| **Z-C** | Die gezeichnete Partikelzahl war eine **Zeltkurve mit Scheitel bei z6**: 2 025 bei z6 gegen 607 ab z11, Schwankung **Faktor 3,3** — gleichzeitig zu voll in der Regionalansicht und zu leer in der Detailansicht. | **umgesetzt** |

## 1. Messaufbau

Desktop 1440×900 (Kartenfläche 794×705 CSS-px), Chrome DevTools MCP, Dev-Server `:5199`,
Nordseeküste (8,2° O / 54,0° N — dort 3–6 m/s, also überhaupt sichtbare Schweife), Layer nur `wind`,
Regler „Normal". Zahlen live aus `__map.style._layers.wind.implementation`.

> ⚠️ **Messfalle, in dieser Sitzung zweimal aufgetreten:**
> 1. **rAF-Drosselung.** Chrome-DevTools-MCP drosselte zwischenzeitlich `requestAnimationFrame`
>    auf **1–2 Hz** (gemessen), obwohl die Seite sichtbar und der Layer nicht pausiert war. Alle
>    Bewegungs-/Optikaussagen unten stammen aus Fenstern mit **verifizierten 60–66 fps**
>    (`rafFps` jeweils direkt vorher gemessen). Ein neuer Tab stellte die volle Rate wieder her.
> 2. **`prefers-reduced-motion: reduce`** ist im Automations-Profil **an**. MapLibre macht
>    `easeTo`/`flyTo` dann zum harten Sprung — die erste Zoom-Messung zeigte deshalb *1* statt 110
>    `move`-Ereignissen. Alle Gestenmessungen unten laufen mit `essential: true`.

## 2. Befund Z-C — die Partikelzahl war eine Zeltkurve (Faktor 3,3)

`getEffectiveParticleCount()` multiplizierte die viewport-skalierte Zahl mit zwei ad-hoc-Rampen:
unterhalb z6 linear hoch (`0,05 + (z−1)·0,19`), oberhalb z6 herunter (`÷1,3` je Stufe bis Boden
0,3). Gemessen (Zielzahl konstant 2 025):

| Zoom | gezeichnet | Punkt-Ø | mittlerer Abstand |
|---|---|---|---|
| 4 | 1 255 | 2,1 px | 15,4 px |
| 5 | 1 640 | 2,5 px | 18,5 px |
| **6** | **2 025** | 3,3 px | 16,6 px |
| 7 | 1 557 | 4,0 px | 19,0 px |
| 8 | 1 198 | 4,8 px | 21,6 px |
| 9 | 921 | 5,5 px | 24,7 px |
| 10 | 709 | 6,3 px | 28,1 px |
| 11–13 | **607** | 7,0–8,5 px | 30,4 px |

Die Begründung der oberen Rampe steht im Code: „die Punktgröße wächst mit dem Zoom, also muss die
Zahl fallen, damit die überdeckte Fläche konstant bleibt". Das Ziel wird verfehlt — die überdeckte
Fläche **wächst** von 15 ‰ (z4) auf 62 ‰ (z13), also um Faktor 4. Beide Rampen zusammen ergeben
genau das, was Jan beschreibt: mal zu viel, mal zu wenig.

## 3. Befund Z-B — der Kopf wächst mit dem Zoom, der Schweif nicht

Die Schweiflänge ist **zoom-unabhängig**: `screenTempoZoomExp = 0` heißt, das Schirmtempo hängt
allein vom Wind ab (px/s = 6 · |V|), und die Trail-Lebensdauer ist wanduhr-normiert. Ergebnis:
19 px bei 2,2 m/s, 45 px bei 5 m/s — auf **jeder** Zoomstufe gleich.

Die Punktgröße dagegen lief über `zoomFactor = 1 + (z−5)·0,3`, gedeckelt bei 3,4:

| Zoom | Kopf-Ø | Schweif bei 2,2 m/s | Verhältnis |
|---|---|---|---|
| 4 | 2,1 px | 19 px | 9,0 : 1 |
| 8 | 4,8 px | 19 px | 4,0 : 1 |
| 10 | 6,3 px | 19 px | 3,0 : 1 |
| 13 | 8,5 px | 19 px | **2,2 : 1** |

Bei 2,2 : 1 ist der „Strich" nur noch doppelt so lang wie der Kopf dick — optisch ein Klecks.
Sichtbar in `screenshots/windpartikel-zoom/ist-z13.png`: fette weiße Punkte mit Stummel.

## 4. Befund Z-A — der Schweif wird während jeder Geste weggeworfen

`WindLayer` hängt an `move` **und** `zoom` denselben Handler, der `clearOnNextFrame` setzt; im
nächsten `render()` wird der Trail-Puffer geleert. Gemessen an einer echten 3-s-Zoomfahrt z7 → z12
(rAF verifiziert bei 60 fps, `essential: true`):

```
während der Geste:  173 Löschungen in 189 Bildern   (reinitParticles: 0)
danach (1,5 s):       0 Löschungen in  90 Bildern
```

Der Grund ist strukturell und für sich genommen richtig: der Trail-Puffer liegt im
**Bildschirmraum**. Bewegt sich die Kamera, passt der aufgezeichnete Schweif nicht mehr zur Karte
darunter — würde man ihn stehenlassen, klebte er als Geisterbild am Bildschirm. Die aktuelle
Antwort darauf ist die gröbste mögliche: **alles wegwerfen**. Folge für den Anwender: Während er
zoomt oder schiebt, bricht der Wind-Layer auf ein nacktes Punktfeld zusammen, und nach dem
Loslassen dauert es ~1,4 s, bis die Striche wieder da sind. Genau das beschreibt Jans erster Satz.

## 5. Umsetzung Z-B + Z-C (2026-08-08)

Beide sind reine TypeScript-Änderungen in `src/wind/WindLayer.ts` — **kein** Shader, **keine**
Pipeline-Berührung, kein neuer Datenpfad.

**Z-C — konstante Dichte je sichtbarer Datenfläche.** Die Zeltkurve entfällt; die gezeichnete Zahl
skaliert jetzt mit `dataViewFraction()` — dem Anteil des Bildes, den die Datenregion tatsächlich
bedeckt. Das ist derselbe Helfer, den der Segment-Stil schon benutzt. Bezugsdichte
`baseDensity` 3 600 → **2 200** je Mio. CSS-px Datenfläche (mittlerer Abstand ~21 px, passend zu
19–45 px langen Schweifen), `minParticles` 1 200 → **400** (sonst klemmt der Boden kleine
Viewports und Übersichts-Zooms wieder hoch).
Die alte Kurve ist **nicht gelöscht**, sondern nach „Rule 2" default-off: wer `zoomThinBase`
ausdrücklich setzt, bekommt sie zurück.

**Z-B — flache Punktgrößen-Kennlinie.** `1 + (z−5)·0,3` gedeckelt 3,4 → `1 + (z−5)·0,08` gedeckelt
**1,5**. Die Untergrenze 0,85 bleibt unverändert, damit der Globus (Zoom ~0–2, dort ohnehin
geklemmt) exakt gleich bleibt.

### Verifikation (Desktop 1440×900, rAF verifiziert 60,1 fps)

Zahlen nachher — dieselbe Messreihe wie §2:

| Zoom | Datenfläche im Bild | gezeichnet | Punkt-Ø | mittlerer Abstand |
|---|---|---|---|---|
| 2 | 3 % | 64 | 2,1 px | 17,1 px |
| 3 | 13 % | 168 | 2,3 px | 21,1 px |
| 4 | 53 % | 723 | 2,3 px | 20,3 px |
| 5–13 | 100 % | **1 296** | 2,5 → 3,8 px | **20,8 px** |

**Der mittlere Partikelabstand liegt jetzt über den gesamten Zoombereich z2–z13 bei 17–21 px**
(vorher 15,4–30,4 px bei Faktor-3,3-Schwankung der Zahl), und der Kopf bleibt mit 2,1–3,8 px immer
deutlich dünner als der 19–45 px lange Schweif.

| Prüfung | Ergebnis | Beleg |
|---|---|---|
| Detailzoom z13 | Striche statt Kleckse | `neu-z13.png` gegen `ist-z13.png` |
| z10 | dito | `neu-z10.png` gegen `ist-z10.png` |
| z6 (vorher der Scheitel) | ruhiger, 1 296 statt 2 025 | `neu-z6.png` gegen `ist-z6.png` |
| DACH-Überblick z5,3 | ruhiger; Schwachwind über Land bleibt kurz (WS1-Grenze, unverändert) | `neu-uebersicht-z53.png` |
| Mobil 390×844 | 900 Partikel, gleiche Optik, keine Regression | `neu-mobil-z11.png` |
| **Kein Partikel-Neustart beim Zoomen** | `reinitParticles` **0×** über eine 3-s-Zoomfahrt; gezeichnete Zahl konstant 1 296 über z7,8 → z12 | Instrumentierung §4 |
| Globus | unberührt: eigene `baseDensity`/`minParticles`, `globeMode` umgeht beide Zweige, Punktgröße bei z0–2 weiterhin auf 0,85 geklemmt | Codepfad + `05-globus-nach-h2.png` (WS1) |
| Konsole | sauber bei frischem Laden und bei normalem Rein-/Rauszoomen | `list_console_messages` |
| `npm run typecheck` | grün | Terminal |

**Ehrlich dazu:** In einem Tab, in dem zuvor eine schnelle Skript-Sprungfolge (Dutzende `jumpTo` +
`resize` in Sekunden) und die rAF-Drosselung gelaufen waren, erschien 3× eine MapLibre-Warnung
(„Expected value to be of type number, but found null instead"). Bei frischem Laden und bei
normalem Zoomen ist sie **nicht** reproduzierbar, und der Diff setzt keine Style-Eigenschaft. Sie
ist damit nicht zugeordnet — aber auch nicht erklärt. Notiert als **V-187**.

## 6. Umsetzung Z-A (ZA-1) — freigegeben von Jan am 2026-08-08

**Diff:** zwei Uniforms in `screenFrag` plus ~60 Zeilen in `WindLayer` (Anker merken, Transformation
rechnen, Löschentscheidung).

Statt den Trail-Puffer bei Kamerabewegung zu verwerfen, wird er beim Abblenden um die Bewegung
seit dem letzten **gezeichneten** Bild verschoben und skaliert:

- **Bezugspunkte sind die beiden Bildecken des letzten Bildes.** Ihre geografische Lage wird nach
  jedem Trail-Pass gemerkt (`captureTrailAnchors`); ihre damalige Bildschirmposition war per
  Konstruktion (0,0) und (W,H). Heute neu projiziert liefern sie Maßstab und Versatz direkt —
  ohne eine einzige Annahme über Mercator-Interna.
- **Der Fade-Pass tastet versetzt ab** (`u_uv_scale`/`u_uv_offset`). Neu ins Bild gekommene Fläche
  hat keine Historie und wird transparent statt als `CLAMP_TO_EDGE`-Schliere gezeichnet.
- **Fallback = das alte Verhalten.** Drehung, Neigung, Globus, laufender Projektionswechsel,
  geänderte Puffergröße oder unplausible Zahlen (Maßstabssprung > ×5 in einem Bild) ⇒ `null` ⇒
  löschen wie bisher. Bei stehender Kamera ist die Transformation die Identität, und der
  Komposit-Pass benutzt sie **immer** — dort ist der Code damit unverändert.
- **Ausgelassene Pässe sind sauber behandelt:** Läuft der Trail-Pass nicht (mobiler Boden-Tier
  mitten im Schwenk), bleibt `cameraMoved` stehen und wird im nächsten gezeichneten Bild gegen den
  dann noch gültigen älteren Bezug abgearbeitet.

### Verifikation (Desktop 1440×900 + mobil 390×844, rAF jeweils vorher verifiziert)

| Prüfung | vorher | nachher | Beleg |
|---|---|---|---|
| Zoomfahrt 3 s (z7 → z12) | **173 Löschungen / 189 Bilder** | **0 Löschungen / 168 Bildern**, 151 davon nachgeführt | Instrumentierung |
| Schwenk 2,5 s | (löschte ebenso je Bild) | **0 Löschungen / 108 Bildern**, 93 nachgeführt | Instrumentierung |
| Mobil 390×844, Zoomfahrt 2,5 s | — | **0 Löschungen / 138 Bildern**, 115 nachgeführt | Instrumentierung |
| **Bild mitten in der Geste** | nacktes Punktfeld | parallele Kometenstriche | `za1-vorher-waehrend-zoom.png` gegen `za1-waehrend-zoom.png` (gleicher Ort, z9,15 gegen z9,16, gleiche Windlage — das „vorher" durch Laufzeit-Abschaltung der Nachführung erzeugt) |
| Mobil mitten in der Geste | — | Striche | `za1-mobil-waehrend-zoom.png` |
| **Stehende Kamera** | — | **0 Löschungen, 0 Nachführungen** in 91 Bildern ⇒ Identitätspfad, unverändert | Instrumentierung |
| **Fallback bei Drehung (bearing 35°)** | — | **91 Löschungen / 150 Bilder, 0 Nachführungen** ⇒ altes Verhalten, kein Geisterbild | Instrumentierung |
| Zurück auf 0° | — | Nachführung greift wieder (0 Löschungen, 87 nachgeführt) | Instrumentierung |
| Maßstabswerte plausibel | — | beim Zoomen isotrop und symmetrisch (z. B. 0,9819/0,9819 mit Versatz 0,0090/0,0090) | Stichprobe |
| Konsole bei **echter** Rad-Bedienung (8× rein, 5× raus) | — | **0 Fehler / 0 Warnungen** | `list_console_messages` |
| `npm run typecheck` | — | grün | Terminal |

**Ehrlich dazu:** Der Trail wird während einer Geste je Bild neu abgetastet (LINEAR). Theoretisch
summiert sich daraus eine leichte Weichzeichnung; sichtbar ist sie nicht, weil der Schweif ohnehin
binnen ~1,4 s ausbleicht — gemessen wurde die Weichzeichnung **nicht**.

## 7. Verworfene Alternative

**ZA-2 — nur die Rückkehr beschleunigen (klein, ohne Pipeline).**
Löschen bleibt, nach `moveend` wird der Schweif schneller aufgebaut … ändert an der leeren Geste
selbst **nichts**. Verworfen als kosmetisch.

## 8. Ursprünglicher Vorschlag (Stand vor der Freigabe)

**ZA-1 — Trail mit der Karte mitziehen (der eigentliche Fix).**
Beim Abblenden des Vorframes wird der Trail-Puffer nicht mehr deckungsgleich gezeichnet, sondern um
die Kamerabewegung seit dem letzten Bild **verschoben und skaliert**. Für Schwenken und Zoomen ohne
Drehung/Neigung ist das im Bildschirmraum eine exakte affine Abbildung (Mercator), ableitbar aus
zwei projizierten Bezugspunkten. Ergebnis: der Schweif bleibt während der ganzen Geste stehen und
sitzt weiter am richtigen Ort. Bei Drehung/Neigung bliebe es beim Löschen (dort ist die Abbildung
keine reine Ähnlichkeit mehr).
Aufwand: ~20 Zeilen in `WindLayer` plus zwei Uniforms/eine UV-Transformation im Vollbild-Pass —
**Render-Pipeline, also STOPP & FRAGEN**. Risiko: der Fade-Pass ist derselbe Code, der die Spur
erzeugt; ein Fehler dort ist sofort im ganzen Layer sichtbar (aber auch sofort erkennbar).

**ZA-2 — nur die Rückkehr beschleunigen (klein, ohne Pipeline).**
Löschen bleibt, aber nach `moveend` wird der Schweif schneller aufgebaut, indem für ~0,5 s mit
kürzerer Lebensdauer gezeichnet wird … ändert an der leeren Geste selbst **nichts**. Ehrlich
gesagt: kosmetisch, löst das Problem nicht.

**Empfehlung: ZA-1.** ZA-2 behebt den Befund nicht, sondern verkürzt nur das Nachspiel.

---

**Belege:** `audit/screenshots/windpartikel-zoom/{ist,neu}-*.png`, Messreihen §2–§5
(Chrome DevTools MCP, Desktop 1440×900 + mobil 390×844, 2026-08-08 22:55–23:20 MESZ,
rAF-Rate jeweils vorher verifiziert).
