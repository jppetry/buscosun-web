# Autobahnwetter — Dossier-Ebene (AWD)

> Stand: 2026-10-26 · Auftrag: Jan, 26.10. · Vorlage: Brandradar-Bühne „Karte | Dossier" (BD2, `audit/brand-dossier-mui.md`)
> Phase **AWD**, Entscheidungen `E-AWD-n`, Befunde `V-AWD-n`. Stand: **umgesetzt 26.10., uncommitted** (§8 Umsetzung und Gate).

## 0. Auftrag (Jan)

Im Autobahnwetter soll es wie im Brandradar eine **Dossier-Ebene** geben, mit einem Umschalter **Karte | Dossier**.
Das Dossier zeigt in der Mitte (statt der Karte)

1. das **Streckenband** (Titel „A 81 · Rohr → Schaffhausen · 148 km", Stand „Messung 10:15", Ländergrenzen „DE | CH",
   Orte, km-Skala, Legende „Messung DWD / keine Messung im 10-km-Umkreis"), und
2. darunter die **Detailansicht des geöffneten Abschnitts** (Kopf „Abschnitt · DE · Messung 10:15", Querschnitt „Was auf der
   Fahrbahn liegt", Gefahren-Fahrplan, Temperaturen −12 … +6 h, Messgrößen gegen Schwellen, Wind zur Fahrbahnachse,
   Ortsmerkmale, Messpunkte und Anker, Nicht messbar, Herkunft).

**E-AWD-1 (Jan, 26.10.): Das Detail verschwindet aus dem rechten Readout** — es wandert in die Mitte, es wird nicht gedoppelt.
Alles andere an der Beschreibung ist bestätigt.

Der Inhalt bleibt **Zeile für Zeile unverändert** (Funktionserhalt): es ist ein Umzug plus Umschalter, keine neue Fachaussage.

## 1. Diagnose (am Code gemessen)

| Baustein | Ist | Datei |
|---|---|---|
| Streckenband | `RoadBand` — Glas-Panel `position: absolute` am Fuß der Karte (`.aw-band`, 16 px Rand, `z-index: 2`); Desktop-Zweig rendert es als Kind von `<main class="aw-map">` | `RoadBand.tsx:43/91`, `RoadPage.tsx:588`, `roadDeck.css:154` |
| Detailansicht | `RoadHazardDetail` (AW-8.2, lazy) — wird als `hzNode` in den Readout-Tab **Gefahren** gehängt, sobald `openSeg && hzShown` | `RoadPage.tsx:447–456`, `RoadReadout.tsx:326–341` |
| Liste (Lage) | `RoadHazardPanel` — erscheint im selben Tab, solange **kein** Abschnitt offen ist | `RoadPage.tsx:453` |
| Zustand | `segId` (offener Abschnitt), `hzDir`, `tab`; URL `seg=`/`hf=`, nur hinter dem Schalter `hz` | `RoadPage.tsx:98–106`, `roadState.ts:23–35` |
| Layout Desktop | `.aw-body` = Flex: Dock 250 · `<main class="aw-map">` · Readout 400 (≤ 1439 px: 230/340) | `roadDeck.css:86/129/182/261` |
| Layout Mobil | Vollbild-Karte + Bottom-Sheet; der Readout (mit Detail) steckt im Sheet (`aw-sheet-readout`) | `RoadPage.tsx:480–550` |
| Zurück/Esc im Detail | „Alle Gefahren" und Esc rufen `onBack` ⇒ `setSegId(null)` | `RoadHazardDetail.tsx:82–86/126`, `RoadPage.tsx:338` |
| Brandradar-Vorbild | Zustand `stage: 'map' \| 'dossier'`, Permalink `ds=1` (nur wenn offen), Segment „Karte \| Dossier" in Topbar/Kopf, Dossier ersetzt NUR die Karte, die Karte dahinter ist `suspended` | `FirePage.tsx:258/1991–1997`, `fireState.ts:80/194` |

**Befund 1 — Der Inhalt braucht keine neue Datenleitung.** Alle Props von `RoadHazardDetail` und `RoadBand` liegen schon in
`RoadPage`; das Dossier ist reine Komposition.

**Befund 2 — Das Band ist heute ein Karten-Overlay.** Im Dossier muss es im Fluss stehen (nicht `absolute`), sonst überdeckt es
den Inhalt. Es darf nie in beiden Bühnen gleichzeitig gemountet sein (zwei `townsRef`-Messungen, doppelte IDs).

**Befund 3 — Die Karte darf nicht neu aufgebaut werden.** MapLibre-Init, Segment-Linien, Radar-Schicht und Callout sind teuer;
das Brandradar hält die Karte hinter dem Dossier angehalten. Hier: `<main class="aw-map">` bleibt gemountet, bekommt `hidden`
(`display: none`) und ruft beim Zurückschalten `map.resize()` — nach dem Muster der Brandkarte.

**Befund 4 — Die Detail-Breite.** `.aw-hz-detail` ist für 400/340 px gebaut. In der Mitte stehen je nach Viewport ≈ 560–1000 px.
Erste Stufe: eine Spalte, `max-width` ≈ 880 px, mittig. Zwei Spalten für die Diagramm-Karten ab ≈ 1100 px sind Politur (V-AWD-1).

**Befund 5 — Ohne den Schalter `hz` gibt es keine Abschnitte.** `ROAD_HZ_LIVE` steht an (seit 21.10.), `?roadhz=0` schaltet aus.
Ohne `hz` bleibt die Seite **unverändert** (Flag-Gating, „Rule 2"); der Umschalter erscheint dann nicht.

## 2. Entscheidungen

| Nr | Entscheidung | Quelle |
|---|---|---|
| E-AWD-1 | Detail verschwindet im Readout, lebt nur im Dossier | Jan, 26.10. |
| E-AWD-2 | **Als Empfehlung umgesetzt, Jans Bestätigung offen — Klick auf der Karte** (Abschnittslinie oder Messpunkt): sofort ins Dossier springen, oder erst markieren und den Wechsel über „Dossier öffnen" in der Liste rechts auslösen? Empfehlung: markieren + Knopf (das Brandradar ging von „sofort" auf Info-Kachel zurück, BD2a, weil der Sprung die Karte entzog). Bis zur Antwort baut der Plan die Empfehlung. | Jan |
| — | **Meine Setzungen** (Jan darf umstoßen): | |
| S-1 | Umschalter nur mit `hz` an; Beschriftung „Karte" / „Dossier", Desktop in der Topbar rechts (vor dem Live-Zeichen), Mobil in der oberen Zeile neben Pill/Teilen (44 px Ziele). | Setzung |
| S-2 | Permalink `ds=1` (wie im Brandradar), nur geschrieben wenn offen; fester Platz hinter `hf`; ungültiger Wert ⇒ Karte. Auf Karte bleibt die URL byte-gleich. | Setzung |
| S-3 | Dossier ohne offenen Abschnitt: Band oben + Leerzustand „Kein Abschnitt markiert. Ein Klick auf einen Abschnitt in der Liste rechts oder auf der Karte öffnet hier sein Dossier." (Ton wie `FireDossier`). | Setzung |
| S-4 | „Alle Gefahren" und Esc im Dossier schließen den **Abschnitt** (`segId = null`), das Dossier bleibt offen; zurück zur Karte nur über den Umschalter. Der Knopf heißt dort „Alle Abschnitte". | Setzung |
| S-5 | Rechter Readout bleibt in beiden Bühnen: Tab Gefahren zeigt **immer** die Liste (`RoadHazardPanel`), die Zeile des offenen Abschnitts ist markiert (`selectedId` besteht schon). Tabs Strecke/Quellen unverändert. | Setzung zu E-AWD-1 |
| S-6 | Die Stations-Karte (`stationCard`, „Messpunkte und Anker") bleibt Teil des Details ⇒ zieht mit ins Dossier um. | Setzung |
| S-7 | Mobil: Dossier = eigene Seite im Platz der Karte (Pill + Umschalter + Zeitchips oben bleiben, Sheet ist ausgeblendet, Inhalt scrollt). Karte bleibt gemountet. | Setzung (Muster BD2 mobil) |

## 3. Plan

1. **`roadState.ts`** — `RoadUrlState.ds?: boolean`; `parseRoadUrl` (nur `hz`, Wert `'1'`, sonst `invalid` ⇒ Karte) und
   `buildRoadUrl` (Platz hinter `hf`, nur wenn wahr).
2. **`RoadPage.tsx`** — Zustand `stage`; `urlState` um `ds` erweitern; `popState` liest `ds`; `pickCorridor` setzt `segId` zurück
   (besteht) — Bühne bleibt. Umschalter-Teile `stageSeg` (Desktop/Mobil). `hzNode` zerlegen: **Liste** immer in den Readout;
   **Detail** nicht mehr als `hz`-Inhalt, sondern als `dossierNode`. Neuer Abschnitt `dossier = <section class="aw-dossier">`:
   `RoadBand` (Variante `static`) + `dossierNode | Leerzustand`. Desktop: `<main class="aw-map" hidden={inDossier}>` plus
   `{inDossier && <main class="aw-dossier-stage">…}`; `map.resize()` im Effekt beim Rückschalten.
3. **`RoadBand.tsx`** — Prop `inline?: boolean` ⇒ Klasse `is-inline` (nur CSS-Unterschied: `position: static`, volle Breite, kein
   Glas). Inhalt, Zähler, Legenden unverändert.
4. **`RoadHazardDetail.tsx`** — nur das Beschriftungs-/Back-Detail aus S-4 (`backLabel` als Prop, Standard bleibt „Alle Gefahren").
   Sonst keine Änderung.
5. **`roadDeck.css`** — `.aw-dossier-stage`, `.aw-band.is-inline`, Breite des Details in der Mitte (Befund 4), Segment in der
   Topbar, Mobil-Seite (S-7); Breakpoints nur 767/1439; Safe-Area per `env(safe-area-inset-*)`.
6. **E-AWD-2 (Empfehlung)** — Karten-Klick markiert (`segId` + `stId` wie heute) **ohne** Bühnenwechsel; die markierte Zeile der
   Liste trägt „Dossier öffnen ›". Listenzeile ohne Markierung: Klick = markieren + Dossier öffnen. Entscheidet Jan anders,
   ist es eine Zeile in `pickSegment`/`pickStation`.
7. **Verifier** — `verify:road-ui` erweitern: Round-Trip `ds=1`; ohne `hz` kein `ds` und keine Umschalter-Marke; `hzNode`
   (Readout) enthält keine `RoadHazardDetail` mehr; genau **ein** `RoadBand` je Bühne.
8. **Gate** — `npm run typecheck`, `verify:road-ui`, `verify:road-hazards`, `build` + `budget` (Erwartung: alles im lazy
   `RoadRoute`-Chunk, eagerJs unverändert); Sichtbelege Desktop 1440×900, Tablet 1024×768, Mobil 390×844 über
   `scripts/lib/headlessShot.mjs` (Chrome-MCP-Resize greift nicht, CLAUDE.md); die fünf Selbstverifikations-Fragen mit Beleg.

## 4. Nicht-Ziele

Keine neue Fachaussage, keine neuen Datenquellen, keine Änderung an Producer/Archiv/Edge/Cron, keine Änderung an
Gefahren-Regeln oder Schwellen, kein Umbau von `RoadCrossSection`/Charts. Keine Commits ohne Auftrag.

## 5. Risiken

* **R-1 Dossier-Breite** — Diagramme (nivo) messen ihre Karte; in der breiteren Mitte müssen sie neu messen. Prüfen im Sichtbeleg.
* **R-2 `hidden`-Karte und MapLibre** — `resize()` beim Zurückschalten; sonst bleibt die Karte 0 px hoch. Prüfen mit Rückweg
  Karte → Dossier → Karte.
* **R-3 Esc-Handler** — `RoadHazardDetail` hängt Esc an `window`; im Dossier ist er die einzige Instanz (Readout rendert das
  Detail nicht mehr) — der Doppelhandler-Fall entfällt.
* **R-4 Teilen-Link** — ein Link mit `seg=` aber ohne `ds` öffnet die Karte mit markiertem Abschnitt (Liste), nicht das Dossier;
  das ist Absicht (S-2) und im Verifier abgedeckt.

## 6. Jans Gates (für `MANUELLE-SCHRITTE.md`)

Sichtprüfung der drei Größen · Antwort E-AWD-2 · Commit/Push (kein Auftrag bisher).

## 7. Verbesserungen (D-28)

* **V-AWD-1** — Diagramm-Karten im Dossier ab ≈ 1100 px in zwei Spalten (Temperaturen | Messgrößen). Mehrwert: weniger Scrollen auf
  großen Schirmen. Skizze: CSS-Grid auf `.aw-hz-detail` mit `grid-column: 1 / -1` für den Artikel.
* **V-AWD-2** — die versteckten Diagramm-Tabellen (`.aw-visually-hidden`) sind Tabellen und ignorieren `width: 1px` (929 px breit ⇒ waagerechte
  Scrollleiste, im Dossier gefunden und dort mit `overflow-x: hidden` gelöst; im schmalen Readout seit AW-8 vorhanden). Mehrwert: kein
  versehentliches Seitwärts-Scrollen. Skizze: `.aw-visually-hidden` global entschärfen (z. B. `contain: paint` an `.aw-card`).

## 8. Umsetzung und Gate (26.10.)

**Gebaut** (alles im lazy Chunk `RoadPage-*.js`; `eagerJs` unverändert):

| Datei | Änderung |
|---|---|
| `roadState.ts` | `RoadUrlState.ds`, Parser (nur `ds=1`, sonst ungültig ⇒ Karte), Aufbau hinter `hf` |
| `RoadPage.tsx` | Zustand `stage`, `openDossier`, `stageSeg`, `dossier`/`dossierBody`/Leerzustand, `hzNode` = nur noch die Liste; Desktop `<main class="aw-dossier-stage">` + Karte mit `hidden`; Mobil `.aw-m-dossier`, Blatt `hidden`; `map.resize()` beim Zurückschalten |
| `RoadBand.tsx` | `inline`-Variante (CSS-Klasse `is-inline`) |
| `RoadHazardDetail.tsx` | Prop `backLabel` („Alle Abschnitte" im Dossier) |
| `RoadHazardPanel.tsx` | `onOpenDossier`: „Dossier öffnen ›" unter der markierten Zeile (nur unter dem ersten Vorkommen — ein Abschnitt steht in mehreren Gruppen); die markierte Zeile scrollt in Sicht |
| `roadDeck.css` | Bühne, Kopf, Körper, Band im Fluss, Leerzustand, Knopf, Tablet, Mobil (CRLF wie der Rest der Datei) |
| `verify-road-ui.mjs` | Gruppe V (V1–V11), U10 angepasst |

**Nachtrag 26.10. (E-AWD-3, Jan: „diese Anzeige kann weg auf der Startseite"):** das Streckenband verschwindet von der Kartenbühne, sobald die Gefahren-Leiste
an ist (`!hz` behält es: `?roadhz=0` bleibt der Rückfall auf die Seite von vorher, V8). Es steht nur noch im Dossier. Die Karte nutzt die volle
Höhe (Kartenrand `bottom` 80 statt 232, Steuerelemente am echten Rand, Klasse `no-band`). Folge: die Karte hat keine Messpunkt-Leiste mehr; Messpunkte
und Abschnitte wählt man über Karte oder Liste, im Dossier weiter über das Band. Mobil unberührt (dort gibt es nur das Mini-Band im Blatt).
`verify:road-ui` 117/117 (V1/V2/V6/V8/U9 angepasst), Beleg `%TEMP%\awd-shots\v1-karte-ohne-band.png`.

**Verhalten:** Karten-Klick markiert nur; Zeilenklick öffnet Abschnitt + Dossier; im Dossier schließen „Alle Abschnitte"/Esc den Abschnitt
(das Dossier bleibt offen); Permalink `ds=1`; ohne den Schalter `hz` ist die Seite unverändert (V8).

**Gate-Belege:**

* `npm run typecheck` grün · `npm run build` 260/260 · `verify:road-hazards` 96/96 · **`verify:road-ui` 117/117** (Gruppe V: Karte als Standard,
  Markieren ohne Sprung, Detail nur im Dossier und nicht mehr im Readout, ein Band je Bühne, Karte bleibt gemountet und wird neu vermessen,
  Permalink, Schalter aus, Mobil 390 × 844 mit 44-px-Tasten, Tablet 1024 × 768).
* Sichtbelege (nicht eingecheckt, `%TEMP%\awd-shots\`): `v3-dossier.png` (Desktop 1440), `v11-tablet-dossier.png` (1024 × 768),
  `v9-mobil-dossier.png` (390 × 844).
* `npm run budget`: `eagerJs` 110,2 > 110 KB und `totalJs` 1922 > 1912 KB rot — nicht von AWD: der Dossier-Code steckt nur im Chunk
  `RoadPage-*` (45,8 KB gzip), nicht im Einstiegs-Chunk; die Ratschen sind laut CLAUDE.md seit HB rot (V-HB-1). Gegen einen Stand vor AWD
  nicht gemessen.
* Befund beim Bau: V-AWD-2 (siehe oben).

**Selbstverifikation (fünf Fragen):** 1 Funktionserhalt — nichts entfernt, das Detail zog um (Readout zeigt die Liste, Reiter Strecke/Quellen
unberührt, `?roadhz=0` unverändert, V8); 2 Desktop — Kartenbühne unverändert bis auf den neuen Umschalter in der Topbar (nur mit `hz`, gewollt),
die bestehenden Layout-Checks A–T grün; 3 Touch-Ziele — Umschalter und „Dossier öffnen" 44 px mobil (V9a, U10); 4 Konsole — I1 sauber;
5 Long Tasks — nicht gemessen (kein Real-Device, headless-shell liefert keine `longtask`).

**Offen für Jan:** Sichtprüfung der drei Größen · E-AWD-2 bestätigen · Commit/Push (§76 in `MANUELLE-SCHRITTE.md`) · V-AWD-1, V-AWD-2.
