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

## 5 · Gate GEZ1

| Frage | Beleg |
|---|---|
| 1 Funktionserhalt | Wizard ohne Zone unverändert (4 Schritte, gleiche Pflichtfelder); Alt-Permalinks ohne `z` laden |
| 2 Desktop | s. §6 |
| 3 Touch ≥ 44 px | Zonen-Knöpfe im Deck-Raster |
| 4 Konsole | s. §6 |
| 5 Long Tasks | s. §6 |

## 6 · Belege

(wird beim Gate gefüllt)
