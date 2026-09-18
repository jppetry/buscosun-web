# HZ1 — Windpartikel bei hohem Zoom: zu viele, zum Teppich verdichtet

> Auftrag (Jan, 2026-09-18, mit Screenshot `partikel_hoherzoom.PNG`, Unterfranken, ≈ z12): „wenn ich im
> hohen zoom in der wetterkarte im windlayer heranzoome werden zu viele windpartikel angezeigt … bitte das
> korrigieren, dass sich die windpartikel bei hohem zoom nicht zu sehr erhöhen."
>
> Status: **umgesetzt und gemessen (uncommitted).** Kein Shader, keine Pipeline, kein Tempo-Eingriff —
> nur die gezeichnete Zahl (derselbe Ort wie Z-C, `audit/windpartikel-zoom.md` §5).

## 0. Kurzfassung

| | Befund | Eingriff |
|---|---|---|
| **HZ-A** | Die gezeichnete Zahl ist ab z5,5 konstant (12 100 bei 794×836 CSS-px), das Bildschirmtempo wächst aber mit `screenTempoZoomExp 0,35` um 2^0,35 je Stufe — die Schweife werden bei z13 **5,5×** so lang wie bei z6. Die von Schweifen bedeckte Fläche stieg von **4,8 % (z6) auf 49,8 % (z13)**. | **umgesetzt**: ab z7 fällt die gezeichnete Zahl je Stufe um 2^−0,75 |
| **HZ-B** | Punkte werden **ohne Blending** in den Schweif-Puffer geschrieben; ihre weichen Ränder überschreiben Nachbarschweife mit kleinem Alpha. Ab ~4 500 Partikeln bei z11 bringen weitere Partikel **keine** Tinte mehr, nur Sprenkel — das ist der „Teppich" im Screenshot. | benannt (V-HZ-2), nicht angefasst (Shader = STOPP & FRAGEN) |

Nachher (Desktop, gleiche Sitzung, gleicher Ort): bis z7 **unverändert** (gleiche Zahl), ab z8 fällt die
bedeckte Fläche beim Reinzoomen **monoton** — 15,3 % (z8) → 12,4 % (z11) → 5,4 % (z13) — statt auf 49,8 % zu
steigen. Der Dichteregler, „Intensiv" und „Aus" wirken unverändert (multiplikativ).

## 1. Messaufbau

- Dev-Server `:5214`, Route `/wetterkarte/wind?lat=50.30&lon=10.40&z=6` (Unterfranken — der Ort des
  Screenshots), nur Layer `wind`, Regler „Normal", 10 m.
- **Eigener Chromium** (Playwright `chromium-1223`, `--headless=new --use-angle=d3d11 --enable-gpu`,
  Hintergrund-/Verdeckungsdrosselung aus) über CDP — Skript
  `audit/windpartikel-hochzoom/wind-zoom-lab.mjs`. GPU: **Intel UHD Graphics (D3D11)**, also echte
  Hardware, kein SwiftShader. rAF je Messpunkt mitgeschrieben: **60–61 fps** (eine Ausnahme 56–57 beim
  ersten Punkt nach dem Laden).
- Je Zoomstufe: `jumpTo` → 3,2 s Einschwingen (Schweif baut sich in ~1,4 s auf) → 1 s rAF-Zählung →
  **Schweif-Puffer per `readPixels` ausgelesen** (`backgroundTexture`, direkt nach dem Swap = letztes
  gezeichnetes Bild): Anteil Pixel mit Alpha > 40/255 („bedeckt") und mittleres Alpha.
- Varianten werden **in derselben Sitzung** zur Laufzeit umgeschaltet (`wl.zoomInThinExp`) — Leistungs-
  und Wetteranker nur innerhalb eines Laufs vergleichen (CLAUDE.md, Lehre „Messen und belegen").
- Rohdaten: `audit/windpartikel-hochzoom/2026-09-18-{desktop,mobil,ab-exponenten}.json`.

> ⚠️ **Messfalle (neu, zweimal aufgetreten):** Sowohl der Claude-in-Chrome-Tab (`visibilityState:
> hidden`) als auch das Playwright-MCP-Fenster (sichtbar, fokussiert!) liefen mit **rAF = 1 Hz** —
> gemessen als exakt 1 000 ms zwischen zwei Bildern, unabhängig vom Zoom. Das ist Chromes
> Hintergrund-/Verdeckungsdrosselung, kein langsamer Frame. Bei 1 fps springt jedes Partikel 60
> Frames weit, die Schweife zerfallen in Punkte, jede Flächenmessung ist wertlos. Abhilfe: eigener
> Browser mit `--disable-backgrounding-occluded-windows --disable-renderer-backgrounding
> --disable-features=CalculateNativeWinOcclusion` (headless=new behält dabei die echte GPU).

## 2. Diagnose HZ-A — konstante Zahl, wachsende Schweife

Die Zahl stammt aus `getEffectiveParticleCount()` = Zustandszahl × `dataViewFraction()` (Z-C,
2026-08-08). Ab z5,5 deckt die Datenregion das Bild, die Zahl bleibt dann auf jeder Stufe gleich. Das war
2026-08-08 richtig, weil damals `screenTempoZoomExp` = 0 galt (Schweiflänge zoom-unabhängig). Seit
2026-08-09 steht der Exponent auf 0,35 (Jans Tempo-Entscheid, unangetastet) — die Schweiflänge wächst
seitdem mit `A(z) = 6 · 2^(0,35·(z−5,5))` px/s je m/s, und seit WG-1 (2026-08-22) ist die Dichte 8× so
hoch (`baseDensity` 18 000). Beides zusammen ergibt:

| Zoom | gezeichnet | Tempo `A(z)` | bedeckt (Alpha > 40) | mittl. Alpha |
|---|---|---|---|---|
| 4,5 | 9 692 | 4,7 | 8,6 % | 4,0 % |
| 5,5 | 12 100 | 6,0 | 4,9 % | 2,4 % |
| 6 | 12 100 | 6,8 | 4,8 % | 2,4 % |
| 7 | 12 100 | 8,6 | 6,7 % | 3,2 % |
| 8 | 12 100 | 11,0 | 9,5 % | 4,5 % |
| 9 | 12 100 | 14,0 | 11,3 % | 5,3 % |
| 10 | 12 100 | 17,9 | 16,8 % | 7,5 % |
| 11 | 12 100 | 22,8 | 28,8 % | 12,0 % |
| 12 | 12 100 | 29,0 | 38,9 % | 16,3 % |
| 13 | 12 100 | 37,0 | **49,8 %** | 20,9 % |

(Desktop, `2026-09-18-desktop.json`, Spalte „alt". z4,5 liegt nur teilweise über Daten — der höhere Wert
dort ist Randeffekt der Datenfläche, nicht Dichte.)

Bildbelege: `screenshots/windpartikel-hochzoom/desktop-vorher-z6.png` (Regionalansicht, gewollter
WG-1-Eindruck) gegen `desktop-vorher-z11.png` / `desktop-vorher-z12_5.png` (Teppich, wie Jans Screenshot).

## 3. Diagnose HZ-B — warum mehr Partikel ab einem Punkt nur noch Rauschen sind

Der erste A/B-Lauf ergab bei z11 mit 12 100 und mit 4 585 gezeichneten Partikeln **fast dieselbe**
Fläche (26,4 % gegen 28,2 %) und dasselbe Alpha-Histogramm; erst bei 2 292 fiel sie (16,7 %). Ursache im
Code: `render()` schaltet vor den Partikelpässen `gl.disable(gl.BLEND)` (`WindLayer.ts`, Pass-Aufbau);
`drawFrag` zeichnet runde Punkte mit weichem Rand (`smoothstep(0.5, 0.18, d)`). Ohne Blending **ersetzt**
jeder Randpixel eines neuen Punkts den Puffer — auch einen hellen Schweif darunter — durch sein kleines
Alpha. In einem dichten Feld löschen sich die Schweife dadurch gegenseitig an; übrig bleibt eine
gleichförmige Sprenkel-Textur ohne erkennbare Einzelschweife.

Ausschnitte 3× vergrößert, gleicher Ort, z11: `screenshots/windpartikel-hochzoom/ausschnitt-12100-z11.png`
(Teppich) gegen `ausschnitt-4585-z11.png` (Linien erkennbar).

Folge für die Messung: die Flächenzahl ist **nur unterhalb der Sättigung** ein Dichtemaß. Darüber sagt sie
„wie viel Schweif überlebt", nicht „wie viele Partikel". Deshalb steigt sie in §5 bei z8 mit der
Ausdünnung zunächst an (weniger gegenseitiges Löschen), obwohl weniger Partikel gezeichnet werden.

## 4. Umsetzung

Rein TypeScript, additiv, Rule 2:

| Datei | Änderung |
|---|---|
| `src/wind/advection.ts` | reine Funktion `zoomInThinFraction(zoom, fromZoom, exp)` = 1 bis `fromZoom`, darüber `2^−exp·(z−fromZoom)`, Untergrenze `ZOOM_IN_THIN_FLOOR` 0,02; `exp` 0 ⇒ exakt 1 |
| `src/wind/WindLayer.ts` | Optionen `zoomInThinExp` (Default **0** = Altverhalten) und `zoomInThinFrom` (Default 7); `getEffectiveParticleCount()` multipliziert den Faktor auf den `points`-Pfad. Globus (`globeMode`) und Segment-Stil kehren vorher zurück ⇒ unberührt. Felder öffentlich wie `zoomDropBoost` ⇒ zur Laufzeit umschaltbar |
| `src/MapView.tsx` | Wetterkarte: `zoomInThinExp: 0.75, zoomInThinFrom: 7` |
| `scripts/verify-wind-advection.mjs` | Block **T8** (9 Prüfungen, s. §7) |

**Warum nur die gezeichnete Zahl:** die Zustandstextur bleibt gleich groß — kein `reinitParticles`, kein
Neustart der Bahnen beim Zoomen. Die ausgelassenen Partikel laufen im Update-Pass weiter, ihre Spur blendet
normal aus, beim Rauszoomen sind sie sofort wieder da. Die Auswahl „erste N Indizes" ist räumlich
gleichverteilt: Neustart und Z3-Umverteilung würfeln je Partikel (`rand(seed)`, `seed` enthält
`v_tex_pos`), nicht nach Index.

**Wahl des Exponenten** — A/B in einer Sitzung (`2026-09-18-ab-exponenten.json`), bedeckte Fläche:

| Zoom | alt (0) | 0,6 ab z7 | **0,75 ab z7** | 0,6 ab z6 |
|---|---|---|---|---|
| 6 | 4,7 % | 4,6 % | 4,7 % | 4,7 % |
| 7 | 6,5 % | 6,5 % | 7,2 % | 10,5 % |
| 8 | 9,5 % | 13,9 % | 14,9 % | 14,4 % |
| 9 | 10,2 % | 16,1 % | 13,6 % | 11,5 % |
| 10 | 15,2 % | 16,7 % | 12,9 % | 11,6 % |
| 11 | 26,9 % | 16,9 % | 12,0 % | 12,2 % |
| 12 | 36,9 % | 13,6 % | 8,8 % | 9,6 % |
| 13 | 46,9 % | 9,5 % | 5,4 % | 6,5 % |

(Ein früherer Lauf: 0,35 ab z7 ⇒ z11 28,2 % / z13 22,6 %; 0,5 ab z7 ⇒ z11 20,7 % / z13 13,8 % — beide
lassen die Fläche bis z11 weiter wachsen.) **0,75 ab z7** ist die einzige Variante, bei der die Fläche
oberhalb von z8 beim Reinzoomen **fällt** und die Regionalansicht (≤ z7) exakt unverändert bleibt; „0,6
ab z6" würde bereits z7 ausdünnen. Rechnerisch ist 0,75 > 0,35 (Tempo-Exponent) + ~0,11 (Punktgröße
`1 + (z−5)·0,08` bis z11,25) — die Tinte je Schweif wird also überkompensiert, was die Sättigung (§3)
abbaut.

## 5. Verifikation (Nachher, echte Konfiguration nach frischem Laden)

**Desktop 1440×900** (`2026-09-18-desktop.json`, „neu" = MapView-Einstellung, „alt" = zur Laufzeit 0):

| Zoom | gezeichnet neu | bedeckt neu | gezeichnet alt | bedeckt alt |
|---|---|---|---|---|
| 5,5 | 12 100 | 4,9 % | 12 100 | 4,9 % |
| 6 | 12 100 | 4,9 % | 12 100 | 4,8 % |
| 7 | 12 100 | 7,4 % | 12 100 | 6,7 % |
| 8 | 7 194 | 15,3 % | 12 100 | 9,5 % |
| 9 | 4 277 | 14,2 % | 12 100 | 11,3 % |
| 10 | 2 543 | 13,3 % | 12 100 | 16,8 % |
| 11 | 1 512 | 12,4 % | 12 100 | 28,8 % |
| 12 | 899 | 8,3 % | 12 100 | 38,9 % |
| 13 | 534 | 5,4 % | 12 100 | 49,8 % |

Bis z7 ist die gezeichnete Zahl identisch; die Flächen-Abweichung dort (≤ 0,8 Pp.) ist das Rauschen der
zufälligen Partikellage zwischen zwei Messzeitpunkten. rAF 57–61 fps in beiden Varianten, `tier high`,
`trailScale 1`, Konsole ohne Warnung/Fehler.

**Mobil 390×844, DPR 3, Touch-Emulation** (`2026-09-18-mobil.json`, Zustandszahl 5 929): neu 5 929 bis z7,
dann 3 525 (z8) → 741 (z11) → 262 (z13); bedeckt 16,5 % (z8) → 7,6 % (z11) → 2,9 % (z13) gegen alt 16,8 % →
37,0 % → 36,2 %. Bilder: `mobil-vorher-z12_5.png` (Teppich) gegen `mobil-nachher-z12_5.png`.

**Funktionserhalt der Regler** bei z11 (Laufzeit-Aufruf wie `MapView`s windCfg-Effekt):
Dichte 0,3 ⇒ 450 · Normal 1 ⇒ 1 512 · Intensiv 2,1 ⇒ 3 160 · Dichte 2,5 ⇒ 3 741 gezeichnet — der Regler
wirkt weiter multiplikativ, auch oberhalb der Schwelle.

| Prüfung | Ergebnis |
|---|---|
| `verify:wind-advection` | **59/59** (vorher 50/50; +9 in T8) |
| `npm run typecheck` | grün |
| `npm run build` | grün, Routing-Verifier 241/241 |
| `npm run budget` | eagerJs 107,9 / largestChunk 301,2 / totalJs 1 366,6 KB — unverändert, alle Grenzen eingehalten |

## 6. Die fünf Selbstverifikations-Fragen

1. **Funktionserhalt** — Aus/Normal/Intensiv, Dichteregler, Höhenwahl, Heatmap: unverändert; der Regler
   ist bei z11 gemessen (§5). Globus: `globeMode` kehrt vor dem Faktor zurück. Segment-Stil (default-off):
   eigener Zweig, unberührt. Fallback: `zoomInThinExp: 0` in `MapView` ⇒ exakt Altverhalten (T8.1).
2. **Desktop pixelgleich** — bis z7 gleiche gezeichnete Zahl (gemessen, §5); darüber ist die Änderung der
   Auftrag. Übersicht `desktop-vorher-z6.png` gegen `desktop-nachher-z6.png`.
3. **Touch-Targets** — keine UI-Änderung.
4. **Konsole** — in allen Lab-Läufen 0 Warnungen/Fehler. (In der verworfenen MCP-Sitzung erschien die
   bekannte MapLibre-Warnung „Expected value to be of type number, but found null" nach `jumpTo`-Folgen —
   V-187, unabhängig von dieser Änderung.)
5. **Long Tasks > 200 ms** — die Änderung fügt je Frame ein `Math.pow` hinzu und zeichnet oberhalb z7
   weniger Punkte; neue Hauptthread-Arbeit entsteht nicht. Gemessen wurde das nicht (headless liefert
   keine `longtask`-Einträge verlässlich, CLAUDE.md).

## 7. Verifier T8 (in `verify:wind-advection`)

Liest die Werte **aus `src/MapView.tsx`** (nicht abgeschrieben): T8.0 Werte vorhanden · T8.1 `exp` 0 ⇒ 1
auf z0–z22 · T8.2 bis zur Schwelle 1 · T8.3/T8.4 genau `2^−exp` je Stufe · T8.5 monoton fallend · T8.6
Untergrenze · **T8.7 Schweif-„Tinte" (gezeichnete Zahl × `A(z)`) wächst oberhalb der Schwelle nicht**,
bis die Untergrenze greift (z14,5) — schlägt an, sobald jemand `screenTempoZoomExp` über
`zoomInThinExp` hebt · **T8.8 Gegenprobe:** ohne Ausdünnung wächst dieselbe Größe bis z13 um > 1,5×.

## 8. Offen / Verbesserungen (V-Einträge, bis `improvements.md` zurück ist)

- **Real-Device fehlt.** Mobil ist Emulation auf der Desktop-GPU (CLAUDE.md: für WebGL nicht
  repräsentativ). Die Änderung senkt die Last, ein Risiko ist nicht erkennbar — aber ungemessen.
- **V-HZ-1 — mobil punktierte Schweife.** Auf Touch deckelt `maxParticleFps 30` den Partikel-Loop; jeder
  Schritt legt zwei Frames Weg zurück, die Schweife erscheinen bei hohem Zoom als Punktketten
  (`mobil-nachher-z12_5.png`). Das ist Altverhalten — der Teppich hat es bisher verdeckt. *Mehrwert:*
  durchgehende Striche auf dem Handy. *Skizze:* im Punkt-Draw zwischen alter und neuer Position einen
  zweiten Punkt setzen (zweiter Draw mit `u_particles` des Vorframes) oder den Deckel oberhalb z10
  lockern — beides Pipeline ⇒ STOPP & FRAGEN.
- **V-HZ-2 — Partikel löschen sich gegenseitig (HZ-B).** Punkte werden ohne Blending in den
  Schweif-Puffer geschrieben; weiche Ränder ersetzen hellere Nachbarschweife. *Mehrwert:* dichte Felder
  (Übersicht, „Intensiv") zeigen Linien statt Sprenkel, die Dichte wird wieder steuerbar. *Skizze:*
  Partikel-Pass mit `blendFunc(ONE, ONE_MINUS_SRC_ALPHA)` oder `max`-Blending (`EXT_blend_minmax`, in
  WebGL1 nicht überall) — Shader-/Pipeline-Eingriff ⇒ STOPP & FRAGEN, vorher gegen die Referenzoptik
  (`audit/windkarte-vorbild-wetteronline.md`) messen.
- **V-HZ-3 — `verify:wind-advection` prüft T1–T7 mit `screenTempoZoomExp 0`**, kommentiert als
  „Produktiv-Einstellung der 2D-Karte"; die Karte fährt seit 2026-08-09 0,35. Die Richtungs-/
  Linearitätsprüfungen gelten für jeden Exponenten, T3.1 („px/s konstant über den Zoom") aber nur für 0.
  *Mehrwert:* der Verifier prüft, was ausgeliefert wird. *Skizze:* `PROD` wie T8 aus `MapView.tsx` lesen,
  T3.1 auf `A(z)`-Verhältnis umstellen.
- **V-HZ-4 — über z14,5 wachsen die Schweife wieder.** Die Karte hat kein `maxZoom`; ab der Untergrenze
  (0,02) bleibt die Zahl stehen, die Schweiflänge wächst weiter. *Mehrwert:* auch bei Straßenzoom ruhig.
  *Skizze:* Untergrenze an `A(z)` koppeln (Tinte konstant) oder `maxZoom` der Wetterkarte festlegen —
  Letzteres ist eine Produktentscheidung (Jan).
