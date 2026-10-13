# Regenradar — alte Anzeigen entfernt (Phase RA, 13.10.2026)

**Auftrag (Jan 13.10.):** „Schnellblick", „Kennzahlen · 6 h" und „Niederschlagssumme" im Niederschlagsradar löschen —
sie stammen aus älteren Versionen und sind zu ungenau. Das ist eine ausdrückliche Freigabe zur Oberdirektive
Funktionserhalt (Löschen von Komponenten = Jans Gate).

## 1 Diagnose

Alle drei Anzeigen lagen in `src/nowcast/NowcastDeck.tsx` und lasen aus `nowcast.summary` / `heroState` (Radar-Nowcast
0–2 h + Modell 2–6 h, die Rechnung vor den Phasen RB/NS/RC/ZO/SK):

| Anzeige | Desktop (Readout) | Mobil |
|---|---|---|
| „Schnellblick" | `Hero`: Etikett + Satz („In 25 min Regen." / „Trocken.") + `HeroBadges` (Glättegefahr, Gewitterrisiko, Starkregen möglich) | Reiter „Schnellblick": derselbe Satz + `MobileAlertChips` (Gewitter %, Starkregen) |
| „Kennzahlen · 6 h" | `Metrics`: Phase, Summe 6 h, Gewitter, Schneegrenze, Starkregen, Hagel, Charakter | Reiter „Detail": `MobileMetrics` |
| „Niederschlagssumme" | `PrecipSumCard`: 9 Balken je 40 min, „kumuliert x mm über 6 h" (unter „Verlauf & Ereignisse") | Reiter „Detail": dieselbe Karte |

Zwei Namen waren doppelt belegt; Jans Entscheidung dazu (Rückfrage 13.10.):

- **E-RA-1 „Niederschlagssumme" = nur die alte Balkenkarte.** Die Karte „Gefallen | Erwartet" aus Phase NS (Abschnitt
  „Niederschlagssumme" im Readout, Stationsmessung + buscosun Fusion) und die Summen-Ansicht im Dock bleiben.
- **E-RA-2 „Schnellblick" = die Anzeige** (Etikett, Satz, Unterzeile), nicht der mobile Reiter. Der Reiter bleibt mit
  seinem Namen als Platz für Regenbeginn, Zell-Orte, Schneefallgrenze, Chance und Summe am Ort.
- **E-RA-3 Badges/Chips gehen mit, kein Rückfall-Schalter** (Jan: „ja passt").

## 2 Umsetzung

- `NowcastDeck.tsx`: gelöscht `Hero`, `HeroBadges`, `Metrics`, `Metric`, `SUM6_HONEST_SUB`, `PrecipSumCard`,
  `VSUM_BUCKET_MIN`, `MobileAlertChips`, `MobileMetrics`, `characterSub`, `sumsOnGlobal`, `BoltIcon`, `DropIcon`, `comma`
  und die nicht mehr gebrauchten Importe. Desktop-Abschnitt „Verlauf & Ereignisse" heißt „Ereignisse"; `EventsTimeline`
  ohne eigenen Titel (der Abschnitt trägt ihn). Mobil „Detail": Ereignisse, Alpin-Karte (Modus Detail), Datenquellen.
- `nowcastDeck.css`, `nowcastMobile.css`: die Regeln der gelöschten Blöcke (`.rr-hero*`, `.rr-badge`, `.rr-metric*`,
  `.rr-vsum-*`, `.rm-peek*`, `.rm-chip*`, `.rm-metrics`).
- Unverändert: `nowcastEngine`, `nowcast.summary`, Ereignisliste, Alpin-Karte, Reiter „Diagramm" (Rate + kumulierte
  Summe), alle Karten der Phasen RB/NS/RC/ZO/SK/ZT/HZS, buscosun Fusion.
- Verifier: `verify-rain-window.mjs` G1 (Regenbeginn-Karte ist das Erste im Readout), G4 (alter Satz entfernt, mit
  Gegenprobe G4b); `verify-precip-sums.mjs` G2 (Kachel „Summe 6 h" samt Band-Zeile entfernt).

## 3 Was damit nirgends mehr steht

Gewitter- und Hagelrisiko in Prozent, Phase, Charakter (Schauer/Dauerregen), „Starkregen Ja/Nein" und die Badges
(Glättegefahr · gefrierender Regen, Gewitterrisiko, Starkregen möglich) haben keine eigene Anzeige mehr. Schneegrenze
steht in der Karte „Schneefallgrenze am Ort" (Phase SK), die Summe in „Gefallen | Erwartet" (Phase NS).

## 4 Gates (13.10.)

| Prüfung | Ergebnis |
|---|---|
| `npm run typecheck` | 0 Fehler |
| `verify:rain-window` | 64/64 |
| `verify:precip-sums` | 57 PASS · 0 FAIL · 2 ⊘ (`--raw` fehlt) |
| `verify:regenchance` · `verify:snowcap` · `verify:height-time` | 44/44 · 56/56 · 58/58 |
| `npm run build` · `npm run budget` | grün · eagerJs 109,9 / 110, totalJs 1 766,3 / 1 772 KB (Grenzen unverändert) |
| Browser (CDP, Produktions-Build, München): Desktop 1440×900, Mobil 390×844 | `.rr-hero`, `.rr-metric*`, `.rr-vsum-*`, `.rm-peek-line`, Badges/Chips: je 0 Elemente; Abschnitte Desktop „Niederschlagssumme" (NS) + „Ereignisse", mobil Detail nur „Ereignisse"; Regenbeginn, Zell-Orte, Summe am Ort, Quellen vorhanden; Konsole: nur die bekannte MapLibre-Warnung `circle-11` |

Rot und unabhängig von dieser Änderung (am sauberen HEAD `8e8646a` nachgeprüft, gleiche Meldung): `verify:cell-places`
59/60 (H2), `verify:cell-towers` 57/59 (G8, G9) — Phasenwachen auf `MapView.tsx`/`NowcastRadarMap.tsx`; dazu
`verify:regenradar-profile` C1b (Bestand, V-FR-11).

## 5 Offen

- **V-RA-1** Mit `?rb=0` (Regenbeginn-Karte aus) steht oben im Readout kein Satz mehr. Mehrwert einer Lösung: der
  Rückfall bliebe lesbar. Skizze: `?rb=0` entfernen oder die Karte ohne Schalter zeigen — Jans Entscheidung.
- **V-RA-2** `heroState`/`HeroState` in `nowcastView.ts` und Teile von `nowcast.summary` (Gewitter-/Hagelrisiko,
  Charakter, `sumMinMm`/`sumMaxMm`) haben keinen Leser in der Oberfläche mehr. Mehrwert: weniger toter Code und Rechnung.
  Skizze: Leser je Feld zählen (Ereignisliste und Alpin-Karte lesen weiter), Rest aus Engine und Modell streichen.
- **V-RA-3** Der mobile Reiter heißt weiter „Schnellblick"; der Hinweistext darin nennt die anderen Reiter.
  Mehrwert einer Umbenennung (z. B. „Am Ort"): Name passt zum Inhalt. Jans Entscheidung.
- Real-Device nicht geprüft (reine DOM-/CSS-Änderung, kein WebGL).
