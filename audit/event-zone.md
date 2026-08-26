# Event-Zone — Fläche statt Punkt (EZ)

> Auftrag (Jan, 2026-08-25): „neben dem Standort noch intuitiv eine Zone einfügen können,
> in der das Event stattfinden wird, um eine noch bessere Aussage treffen zu können —
> am besten mit Maus drücken und ziehen eine Fläche auf der Karte aufziehen."

Diagnose-First nach `CLAUDE.md`. Sonde: `scripts/l0/probe-event-zone.mjs`.

---

## 1 · Bestand

| Baustein | Datei | Lage |
|---|---|---|
| Eingabe Ort | `src/event/EventPage.tsx` → `LocationField` | Geocode-Suche, **ein Punkt**, keine Karte |
| Anfrage-Modell | `src/event/eventModel.ts` → `EventQuery` | `location: Location` — Fläche existiert nicht |
| Permalink | `src/event/eventState.ts` | `a`/`l`/`w`/`p`; tolerant gegen unbekannte Felder |
| Bewertung | `src/event/eventScoring.ts` → `recommendBestDay(query, forecast)` | rechnet aus **einem** `PointForecast` |
| Mehrpunkt-Muster | `src/event/eventAltLocation.ts` | holt bereits **8** Punktforecasts auf Knopfdruck und bewertet sie mit demselben Profil — die Vorlage für die Zone |
| Karte im Feature | `EventResult.tsx:53` | `lazy(() => import('../MapView'))` — maplibre ist auf dieser Route bereits ein **Lazy-Chunk**, keine neue Abhängigkeit |
| Karten-Picker (tot) | `src/history/MapPicker.tsx` | 70 Zeilen, MapLibre + `liberty`-Stil, **nirgends importiert** — brauchbare Referenz, kein Wiederverwender |

Es gibt im Repo **keinen** Zeichen-/Draw-Modus für Flächen (kein `maplibre-gl-draw`), also wird der
Rechteck-Zug selbst gebaut — vier Zeilen Zustand statt einer Abhängigkeit (D-06).

## 2 · Die eine Frage, die vor dem Bau zu messen war

Eine Zone ist nur dann „eine bessere Aussage", wenn der Punktforecast **innerhalb** der Zone
überhaupt verschiedene Werte liefert. Gemessen (Sonde, 2026-08-25, 30 Vorhersagestunden,
Mitte + 4 Ecken je Zone, `getPointForecast` unverändert):

| Zone | Kantenlänge | Spanne T (Mittel) | Spanne T (Max) | Spanne Böe | nächste Stationen |
|---|---|---|---|---|---|
| Berlin · Tempelhofer Feld | 1,5 km | **0,03 K** | 0,00 K | 0,00 m/s | `dwd_obs` @ 40–47 km |
| Lüneburger Heide | 8 km | **0,16 K** | 0,05 K | 0,00 m/s | `dwd_obs` @ 31–43 km |
| Zell am See (alpin) | 6 km | **3,82 K** | 5,19 K | 1,76 m/s | `tawes` @ 2,8–8,3 km |

**Befund V-EZ-1 — die Zone trägt im Gebirge, im Flachland nicht.** Der Unterschied kommt aus
Geländehöhe und Stationsgeometrie (AT: TAWES 2,8 km entfernt, AROME 2,5 km Gitter), nicht aus
aufgelöster Konvektion. Bei ~40 km Stationsabstand über flachem Gelände ist das Feld im
Zonenmaßstab **glatt** — fünf Abrufe liefern fünfmal dasselbe.

Daraus folgt die Gestaltungsregel, nicht umgekehrt: die Zone wird gesampelt und das Ergebnis
**benannt**, statt eine räumliche Auflösung zu behaupten, die die Quellen nicht haben. Ist die
Spanne unter der Schwelle, sagt die App genau das („Das Modell löst diese Zone nicht auf").
Eine Größen-Sperre vorab (»Zone < 2,5 km ⇒ verboten«) wäre falsch: dieselben 1,5 km sind im
Flachland bedeutungslos und am Hang bedeutend.

**V-EZ-2 (Nebenbefund):** in der Node-Sonde meldet `PointForecast.query.elevation` **0 m** an
allen fünf Punkten — die DEM-Lookup-Datei wird ohne Browser nicht geladen. Die gemessenen
Spannen sind damit die **untere** Schranke; im Browser kommt die Höhenkorrektur noch dazu.

## 3 · Entscheidungen

| # | Frage | Entscheidung | Grund |
|---|---|---|---|
| E1 | Geometrie | **Rechteck** (achsparallel, WGS84) | Jans Vorgabe „drücken und ziehen"; ein Polygon-Editor wäre eine zweite Interaktion ohne Mehrwert für die Aussage |
| E2 | Pflicht? | **optional**, additiv | Funktionserhalt: ohne Zone verhält sich alles wie bisher |
| E3 | Wirkt die Zone auf den Score? | **Nein — sie ergänzt eine Spanne** | Rule 2 (Flag-Gating): der neue Rechenpfad ersetzt den alten nicht. Der Hauptwert bleibt der Punkt am gewählten Ort, die Zone sagt, wie weit die Fläche davon abweicht |
| E4 | Wie viele Abrufe? | **4 Ecken** zusätzlich, nur für den empfohlenen Tag, nur mit Zone | Muster `eventAltLocation` (8 Abrufe auf Knopfdruck); die Ecken laufen automatisch, weil sie die Aussage tragen |
| E5 | Zonengröße | Kante **≤ 60 km** gedeckelt | jenseits davon ist es kein Event-Gelände mehr, und die Ecken lägen in anderen Wetterlagen |
| E6 | Permalink | additives Feld `z: [w,s,e,n]` | alte Links bleiben gültig (fehlendes `z` = keine Zone) |
| E7 | Karte | eigenes **Lazy**-Modul `EventZoneMap.tsx` | maplibre bleibt aus dem Wizard-Chunk, bis die Karte geöffnet wird |

## 4 · Umsetzung

* **EZ1 · Modell** `src/event/eventZone.ts` — DOM-frei: `EventZone {west,south,east,north}`,
  `zoneFromDrag` (normalisiert jede Zugrichtung), `zoneSpanKm`/`zoneAreaKm2`, `clampZone`
  (E5), `zoneSamplePoints` (Mitte + 4 um 10 % eingerückte Ecken) und `classifyZoneSpread`
  (die Schwelle aus §2).
* **EZ2 · Eingabe** Schritt 1 des Wizards: unter dem Ortsfeld „Zone (optional)". Knopf
  *Fläche aufziehen* schaltet die Karte in den Zeichenmodus (Panning aus, Fadenkreuz),
  Maus/Finger drücken + ziehen zieht das Rechteck live auf, Loslassen beendet den Modus.
  *Neu aufziehen* / *Entfernen* danach.
* **EZ3 · Aussage** im Resultat: Abschnitt „Zone" am empfohlenen Tag — Spanne der Bewertung
  über die Zone, schwächste Ecke mit Grund, und bei zu kleiner Spanne der ehrliche Satz.
* **Verifikation** `npm run verify:event-zone` (netzfrei, DOM-frei).

## 4a · Was der Bau zusätzlich zutage gefördert hat

**V-EZ-3 — vier Ecken parallel sind ein HTTP 429.** Der erste Entwurf holte die
Eckpunkte mit `Promise.all`. Im Kaltstart (Zell am See, AT) quittierte
`dataset.api.hub.geosphere.at` das mit **sechs 429ern** (AROME + INCA je Ecke,
unmittelbar nach dem Hauptabruf desselben Endpunkts) — die halbe Zone wäre still
aus der Spanne gefallen. Die Ecken laufen jetzt **nacheinander** mit 300 ms Pause
und einem Wiederholungsversuch nach 1,5 s; die Nachmessung am kalten Permalink
ergibt **5/5 Messpunkte, Konsole ohne Fehler**. `eventAltLocation.ts` trägt
dasselbe Parallel-Muster (8 Abrufe) — dort auf Knopfdruck, deshalb hier nur
vermerkt, nicht mitgeändert.

**V-EZ-4 — das Loslassen darf die Fläche nicht neu rechnen.** `touchend` trägt
keinen Finger mehr; seine `lngLat` ist nicht die zuletzt gezeichnete Position.
Gemessen: Vorschau 2,4 × 1,7 km, aus dem Ereignis gerechnet 3,7 × 2,6 km.
Übernommen wird jetzt das zuletzt gezeichnete Rechteck (`dragRef.last`) — was
der Nutzer sieht, ist was gesetzt wird. Am Bild geprüft: das übernommene
Rechteck deckt sich mit der Fingerbahn (Zug 101→243 px / 67→168 px auf einer
337 × 240-px-Karte).

## 5 · Gate GEZ1

| Frage | Beleg |
|---|---|
| 1 Funktionserhalt | Wizard ohne Zone unverändert (4 Schritte, gleiche Pflichtfelder); Alt-Permalinks ohne `z` laden |
| 2 Desktop | s. §6 — Schritt 1 ohne Zone unverändert, der Block liegt darunter |
| 3 Touch ≥ 44 px | Zonen-Knöpfe `min-height: 44px` unter 767 px, Finger-Zug am 390er belegt |
| 4 Konsole | fehlerfrei (nach V-EZ-3) |
| 5 Long Tasks | **offen — in dieser Umgebung nicht entscheidbar**, s. §6 (V-EZ-5) |

## 6 · Belege

| Prüfung | Ergebnis |
|---|---|
| `npm run verify:event-zone` | **41/41** (Geometrie, Deckel, Messpunkte, Spannen-Einordnung inkl. des gemessenen Flachland-Falls, Permalink additiv + tolerant, Validierung) |
| `npm run typecheck` | grün |
| `npm run budget` | eagerJs **101,5 KB** unverändert (maplibre bleibt lazy), totalJs 980,9 → **985,8 / 1017,7 KB**, größter Chunk maplibre 278,4 KB — alle Budgets eingehalten |
| Desktop 1440 × 900 | Maus drücken + ziehen zieht das Rechteck live auf (Zwischenstand 5,2 × 3,3 km · 17 km²), Loslassen setzt es; Knöpfe wechseln auf *Neu aufziehen* / *Entfernen* |
| Mobile 390 × 844 | Finger-Zug über CDP-Touch-Ereignisse: Rechteck gezeichnet und übernommen (3,3 × 2,3 km · 7,7 km²), Knöpfe ≥ 44 px, Karte 240 px hoch |
| Tablet 1024 × 768 | Karte öffnen, Fläche mit der Maus aufziehen und übernehmen (5,0 × 3,1 km · 16 km²); Zonenblock auf 560 px begrenzt wie das Ortsfeld |
| Karte öffnen (Prod-Preview) | **0 Long Tasks** im Fenster „Knopf → Karte steht" |
| Ergebnisseite | Abschnitt „Zone am besten Tag" mit Spanne, Satz und fünf Messpunkten; Zell am See 5,2 × 3,3 km ⇒ **94–94 Punkte**, Band `uniform` — der Satz sagt ausdrücklich, dass die Quellen die Fläche nicht auflösen |
| Permalink | `z`-Feld im Hash, kalt geladen ⇒ Zone kommt zurück und wird neu abgetastet; Links ohne `z` laden unverändert |
| Konsole | nach V-EZ-3 fehlerfrei (vorher 6 × HTTP 429) |

**V-EZ-5 — Long Tasks beim Ziehen sind hier nicht messbar.** Im Automations-Browser
läuft `requestAnimationFrame` mit **1004 ms Takt** (gemessen im Prod-Preview,
5 Bilder) — die bekannte Drosselung dieses Repos (`perf-2d-rendering.md`,
„MCP drosselt rAF"). Werte aus dem Zug-Fenster (einmal bis 1060 ms, in der
Wiederholung 115 ms) schwanken entsprechend und taugen weder als Freispruch noch
als Befund. Was messbar war: das **Öffnen** der Karte erzeugt 0 Long Tasks.
Unabhängig davon wurde die Zeichenschleife entlastet: die Vorschau wird auf
**ein Bild zusammengefasst** (rAF-Koaleszierung), statt je `mousemove` zu rendern —
belegt mit 40 Ereignissen in EINEM Task, die kein einziges Zwischen-Neuzeichnen
auslösen, während die übernommene Fläche unverändert korrekt bleibt. Eine
belastbare Long-Task-Aussage zum Ziehen braucht ein echtes Gerät (Jan informieren).

**Offen:** ein Fall mit tatsächlich `strong`-Spanne ist am Live-Wetter noch nicht
begegnet (die Sonde belegt 3,82 K Temperaturspanne alpin, an diesem Tag ergab das
trotzdem dieselbe Punktzahl). Die Bänder `slight`/`strong` sind im Verifier
abgedeckt, in der Live-Ansicht bislang nicht gesehen.
