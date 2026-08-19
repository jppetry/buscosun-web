# audit/waldbrand-zeit.md — WB3: Zeitregler, Playback, Mobile (Gate GWB3)

> **Stand: 2026-08-14.** Diagnose **vor** dem ersten Handgriff. Vorgänger:
> `audit/waldbrand-layer.md` (WB2, vier Layer live). Plan: `plan.md` §WB3 ·
> Gate: `checklist.md` §GWB3 · Protokoll: `tests.md` §WB-T4/§WB-T5.

## 0. Was schon steht — und was das für WB3 bedeutet

Drei Punkte der Gate-Liste sind in WB2 nebenbei erledigt und werden hier nur noch **belegt**, nicht
neu gebaut: die Klemmung auf den kleinsten gemeinsamen Horizont (im UI nachgemessen: 9 → 1 → 6 →
kein Regler), die Grenzübergänge (`wb2-grenze-de-ch.jpeg`) und die Touch-Targets ≥ 44 px.

**Neu zu bauen sind vier Dinge:** rAF-Playback, Prefetch der Tagesframes, `FrameGovernor`-Bindung,
Bottom-Sheet. Dazu kommt das Scrub-Verhalten, das ohne Gegenmaßnahme das Netz flutet.

## 1. Der Unterschied zum Regenradar — und warum er alles bestimmt

`NowcastRadarMap.tsx:269-279` ist das vorgeschriebene Muster, aber die Lage ist **nicht** dieselbe:

| | Regenradar | Waldbrand |
|---|---|---|
| Achse | Float-Frameposition, 5-min-Frames | **ganze Tage**, 0…+9 |
| Frames | liegen als Werte-Arrays **im Speicher** | EU-Index liegt als **Kacheln beim Fremdserver** |
| Framewechsel | Textur-Lerp, kein Netz | **~20 HTTP-Kacheln je Tag** |
| Kosten eines Durchlaufs | 0 Requests | bis zu **200 Requests** |

Daraus folgt der Kern dieser Phase: **Ohne Prefetch ist Playback ein Netzwerk-Sturm**, und ohne
Entprellung wird schnelles Scrubben zu einem Request je Zwischenschritt.

## 2. Warum unsichtbare Layer nicht vorladen

Naheliegend wäre: für jeden Tag eine eigene `raster`-Source anlegen und nur die Sichtbarkeit
umschalten — dann hielte MapLibre die Kacheln je Tag vor. **Das funktioniert nicht.** In WB2 am
lebenden Objekt gemessen: solange `visibility: none` gesetzt ist, fragt MapLibre **null** Kacheln an
(damals 0 GWIS-Requests, bis die Sichtbarkeit stimmte). Ein unsichtbarer Layer lädt nichts.

**Konsequenz:** Prefetch muss **außerhalb** von MapLibre passieren — über `new Image()` auf die
Kachel-URLs, die der Browser dann im HTTP-Cache hält. Dafür brauche ich die Kachelraster-Zerlegung
des sichtbaren Ausschnitts selbst; MapLibre gibt sie nicht heraus.

## 3. `FrameGovernor` ohne Sonderpfad (D-09)

Der Governor regelt in dieser App die **FPS-Leiter** der Windpartikel (`perfGovernor.ts:164`,
Modus `fpsLadder`). Waldbrand hat keine Partikel — hier ist die sinnvolle Bindung eine andere:
`initialTier(readDeviceCaps(gl))` liefert `low | mid | high`, und daraus wird die
**Abspielgeschwindigkeit** abgeleitet. Ein schwaches Gerät blättert langsamer, statt dass die
Darstellung leidet. Das ist **keine** zweite Performance-Mechanik, sondern dieselbe Klassifikation an
einem anderen Stellrad — D-09 bleibt gewahrt, weil kein konkurrierender Regelkreis entsteht.

## 4. Scrubben: drei Geschwindigkeiten, nicht eine

Ein Tageswechsel zieht heute (WB2) sofort die Raster-Quelle neu. Beim Ziehen des Reglers über sieben
Tage wären das sieben Quellenwechsel in einer Sekunde. Die Trennung:

| Reagiert | Was | Warum |
|---|---|---|
| **sofort** | Beschriftung, DE-Stationsfarben, Hinweis „folgt dem Regler nicht" | rein lokal, kostet nichts |
| **entprellt (~140 ms)** | WMS-Quelle | jeder Wechsel sind ~20 Requests |
| **im Leerlauf** | Prefetch des Nachbartags | soll nie mit dem sichtbaren Tag konkurrieren |

## 5. Mobile: Bottom-Sheet statt gestapelter Spalten

Heute stapelt die Mobilfassung Karte (52 vh) → Dock → Readout untereinander. Das ist bedienbar, aber
die Karte ist klein und die Legenden sind weit weg. Das Repo hat mit `src/mobile/BottomSheet.tsx`
bereits ein Primitiv (Snaps `collapsed 64 px / half 45 vh / full 90 vh`, Drag nur am Griff, damit
Sheet-Ziehen und Inhalts-Scrollen sich nicht in die Quere kommen). **Wiederverwenden statt nachbauen.**

Der Zeitregler gehört dabei **nicht** ins Sheet: Er muss auch bei eingeklapptem Sheet erreichbar
sein, sonst kann man die Karte nicht bedienen, während man sie sieht. Er bekommt eine eigene Leiste
über dem Sheet-Griff.

## 6. Risiken

| # | Risiko | Gegenmaßnahme |
|---|---|---|
| Z1 | Playback flutet das Netz | Prefetch + Entprellung, Deckel auf gleichzeitige Prefetches |
| Z2 | Prefetch konkurriert mit dem sichtbaren Tag | `requestIdleCallback`, Abbruch bei Reglerbewegung |
| Z3 | Der WMS-Server ist ein Fremdsystem — ein Dauerlauf-Playback ist unhöflich | Playback endet am Horizont (kein Endlos-Loop als Vorgabe), Geschwindigkeit gedeckelt |
| Z4 | Bottom-Sheet verdeckt die Karte | Snap `collapsed` als Startwert, Zeitregler außerhalb des Sheets |
| Z5 | `moveLayer` der Maske bei jedem `applyState` | ist idempotent, aber bei 60 Hz Playback unnötig — nur bei Bedarf aufrufen |
| Z6 | Long Tasks > 200 ms beim Tageswechsel | Quellenwechsel ist ein `removeLayer`/`addSource` — im Trace zu messen, nicht zu vermuten |
