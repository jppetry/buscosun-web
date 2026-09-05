# KEYWORDS — Zielgruppen × Features × Suchintention

> Stand: 2026-09-04 · Stufe 1 (Keyword-Set) · erzeugt aus der Code-Inventur (drei parallele Lesungen von `src/`, `scripts/`, `public/`) und Live-Messungen gegen https://buscosun.com. Kein Code geändert, kein Commit.

Intention: **I** informational · **N** navigational/tool · **T** transaktional („jetzt planen") · **L** lokal.
Saisonalität in Klammern. Jede Zeile nennt die Zielseite (bestehend oder geplant, Etappe).

## Zielgruppe 1 · Gleitschirm / Segelflug / Drachen
| Suchbegriff | Int. | Situation | Feature | Zielseite |
|---|---|---|---|---|
| höhenwind vorhersage gleitschirm | N | Abend vor dem Flugtag | A2, G1 | `/fuer/gleitschirmflieger/` (E6), `/atmosphaere/fliegen` |
| thermik vorhersage heute | N | morgens | G5 | `/atmosphaere/fliegen`, `/wissen/thermik/` (E4) |
| windprofil startplatz | N | — | G1 | `/atmosphaere/querschnitt` |
| föhn gleitschirm gefährlich | I | Alpen (Herbst/Frühjahr) | G4 | `/wissen/foehn/` |
| talwind umkehr uhrzeit | I | Nachmittag | G5 | `/wissen/talwind/` (E5) |
| inversion gleitschirm thermik | I | Winter | G2 | `/wissen/temperaturinversion/` |
| wolkenbasis vorhersage | I | — | D8, G6 | `/glossar/wolkenbasis/` (E5) |
| wind 850 hpa karte | N | — | A2 | `/wetterkarte/wind` (E1) |
| dhv wetter alternative kostenlos | N | — | — | `/fuer/gleitschirmflieger/` |
| skew t diagramm deutschland | I/N | Profi | G6 | `/wissen/skew-t/` (E5) |
| windscherung vorhersage | I | — | G1 | Glossar |
| böen vorhersage flugplatz | N | — | A3 | `/wetterkarte/boeen` |

## Zielgruppe 2 · Bergsport (Wandern, Hochtour, Skitour, Klettersteig)
| Suchbegriff | Int. | Situation | Feature | Zielseite |
|---|---|---|---|---|
| wetter entlang der route gpx | N | Tourplanung | D1–D6 | `/tourenplanung`, `/funktionen/tourenplanung/` (E4) |
| wanderzeit berechnen din 33466 | I | — | D3 | `/methodik/tourenplanung-zeitmodell/` (E3) |
| schneefallgrenze heute alpen | L/N | Winter/Übergang | A12, B1 | `/wetterkarte/schneegrenze` (E1), `/wissen/schneefallgrenze/` (E4) |
| nebelobergrenze heute | L/N | Herbst/Winter | G2 | `/atmosphaere/querschnitt?…` → `/wissen/nebel-hochnebel-nebelobergrenze/` |
| über dem nebel sonne wo | I | Herbst | G2 | dito |
| gewitter klettersteig wann sicher | I | Sommer | A9, A15, A18 | `/fuer/bergsport/` (E6), `/wissen/gewitter-unwetter/` (E4) |
| wetter zugspitze höhenkorrigiert | L | — | A5 | `/wetter/garmisch-zugspitze/` |
| beste startzeit bergtour wetter | I/N | — | D8 | `/fuer/bergsport/` |
| lawinenlagebericht wo | I | Winter | A23 (Deep-Link) | Ortsseiten alpin (ehrliche Negativ-Auskunft) |
| hüttenwetter alpen | L | — | A23 | Ortsseiten |
| wetter grat vs tal unterschied | I | — | B5 | `/methodik/hoehenkorrektur/` (E3) |
| e5 alpenüberquerung wetter etappen | I/N | Sommer | D6 | `/fuer/bergsport/` |

## Zielgruppe 3 · Landwirtschaft / Weinbau / Garten
| Suchbegriff | Int. | Situation | Feature | Zielseite |
|---|---|---|---|---|
| hagel aktuell radar | N | Gewitterlage | A19 | `/wetterkarte/hagel` (E1) |
| hagelradar schweiz meshs | N | Apr–Sep | A19 | dito + Glossar MESHS/POH |
| bodenfeuchte karte deutschland aktuell | N | Dürre | H9 | `/waldbrand/trockenheit` |
| dürre aktuell karte | N/I | Sommer | H9 | dito |
| wachstumsgradtage berechnen | I | Frühjahr | F3 | `/wissen/wachstumsgradtage/` (E5), `/fuer/landwirtschaft/` (E6) |
| letzter frost datum statistik ort | I | Frühjahr | F3 | `/fuer/landwirtschaft/`, Ortsseiten-Klimablock (E8) |
| frostwarnung morgen | N | Frühjahr | A23 | Ortsseiten (ehrlich: kein Push) |
| trockenperiode statistik | I | — | F3 | `/wissen/trockenperioden/` (E5) |
| heuwetter vorhersage | I/N | Sommer | C2, A4 | `/fuer/landwirtschaft/` |
| spritzfenster wind vorhersage | N | — | A1, A3 | dito (ehrlich: kein Agrar-Modul) |
| unwetterwarnung landkreis aktuell | L/N | — | A20 | `/warnungen` |
| pollenflug österreich | I | Frühjahr | A23 | Orts-FAQ (Negativ-Auskunft), `/fuer/allergiker/` (E6) |

## Zielgruppe 4 · Bau / Kran / Gerüst / Höhenarbeit
| Suchbegriff | Int. | Situation | Feature | Zielseite |
|---|---|---|---|---|
| kran windgrenze vorhersage | N | Tagesplanung | G3 | `/atmosphaere/arbeitsfenster` (E7), `/fuer/bau-und-kran/` (E6) |
| windgeschwindigkeit in 50 m höhe vorhersage | I/N | — | G3 | dito, `/methodik/hoehenwind-arbeitshoehe/` (E3) |
| böen vorhersage baustelle | N | — | A3 | `/wetterkarte/boeen` |
| sturmwarnung gerüst | I | — | A20 | `/warnungen` |
| ab welcher windstärke kran stopp | I | — | G3 | Explainer `/wissen/windgrenzwerte-arbeit/` (E5) |
| betonieren frost vorhersage | I | Winter | A23 | `/fuer/bau-und-kran/` |
| dachdecker wetter regen fenster | N | — | B4 | `/regenradar` |
| go no go drohne wind | N | — | G3 | `/fuer/drohnenpiloten/` (E6) |
| drohne fliegen wind limit dji | I | — | G3, A3 | dito |

## Zielgruppe 5 · Event- und Veranstaltungsplanung / Hochzeit
| Suchbegriff | Int. | Situation | Feature | Zielseite |
|---|---|---|---|---|
| bester tag für gartenparty wetter | T | Wochenplanung | E1, E2 | `/eventplanung/grillen` (E7) |
| hochzeit wetter plan b | I/T | Monate vorher | E3, E5 | `/eventplanung/hochzeit` (E7), `/fuer/hochzeit/` (E6) |
| wetter hochzeit freie trauung risiko | I | — | E3 | dito |
| festival wetter planung zelt wind | I | — | E5, E6 | `/fuer/veranstalter/` (E6) |
| open air wetter absage kriterien | I | — | E5 | dito |
| wettervorhersage 7 tage zuverlässigkeit | I | — | C2, E4 | `/wissen/modellvergleich-unsicherheit/` (E4) |
| grillabend wetter wochenende | T | — | E2 | `/eventplanung/grillen` |
| picknick wetter bester tag | T | — | E2 | `/eventplanung/picknick` |
| gewitterrisiko veranstaltung heute | N | — | A15, A18 | `/wetterkarte/zellbahnen`, `/wetterkarte/gewitter` |
| wetter für event kalender export ics | N | — | E9 | `/funktionen/event-tag/` (E4) |

## Zielgruppe 6 · Feuerwehr / Katastrophenschutz / Forst
| Suchbegriff | Int. | Situation | Feature | Zielseite |
|---|---|---|---|---|
| waldbrandgefahr heute karte | L/N | Sommer | H1 | `/waldbrand/gefahrenindex` |
| waldbrandgefahrenindex dwd stufe 4 bedeutung | I | — | H2 | `/wissen/waldbrandwarnstufen/` (E5) |
| waldbrandwarnstufe brandenburg aktuell | L | — | H2 | dito + `/waldbrand` |
| aktive waldbrände deutschland karte | N | Ereignis | H3 | `/waldbrand/aktive-braende` |
| waldbrand <ort> satellitenbild | N | Ereignis | H6 | `/waldbrand/aktive-braende`, Methodik Brandnarbe (E3) |
| fire weather index erklärt | I | — | H1 | `/wissen/fire-weather-index/` (E5) |
| firms hotspots deutschland | N | — | H3 | `/waldbrand/aktive-braende`, Glossar |
| waldbrände 2026 deutschland statistik | I | Saison | H7 | `/waldbrand/historie` (E7) + Saisonartikel |
| gewitterzelle zugrichtung radar | N | Einsatz | A18 | `/wetterkarte/zellbahnen` |
| unwetterwarnung aktuell landkreis dwd | N | Einsatz | A20 | `/warnungen` |
| bodentrockenheit waldbrand zusammenhang | I | — | H9 | `/waldbrand/trockenheit` |
| copernicus ems aktivierung waldbrand | I | — | H5 | Glossar |
| feuerwehr wetter app kostenlos | N | — | — | `/fuer/feuerwehr-katastrophenschutz/` (E6) — **ehrlich: kein Einsatzsystem** |

## Zielgruppe 7 · Radsport / E-Bike / Motorrad
| Suchbegriff | Int. | Situation | Feature | Zielseite |
|---|---|---|---|---|
| rennrad wetter route gegenwind | N | Tourplanung | D3, D6 | `/fuer/radsport/` (E6), `/tourenplanung` |
| e-bike reichweite berechnen steigung | I/N | — | D5 | `/fuer/e-bike/` (E6), `/methodik/e-bike-reichweite/` (E3) |
| wetter unterwegs radtour uhrzeit | N | — | D6 | `/funktionen/tourenplanung/` |
| gpx wetter vorhersage komoot alternative | N | — | D1 | dito |
| bikepacking wetter mehrere tage | I | — | D4, C2 | `/fuer/radsport/` |
| motorrad passwetter alpen | L/N | Sommer | D6, A5 | `/fuer/radsport/` (Motorrad-Abschnitt) |
| regen radtour wann losfahren | N | — | D8 | `/tourenplanung` |
| windkarte rennrad training | N | — | A1 | `/wetterkarte/wind` |

## Zielgruppe 8 · Segeln / Surfen / SUP (Binnenseen)
| Suchbegriff | Int. | Situation | Feature | Zielseite |
|---|---|---|---|---|
| wind bodensee vorhersage | L/N | — | A1, A3 | `/wetter/konstanz/`, `/fuer/segler/` (E6) |
| föhnböen bodensee | I | Herbst | G4 | `/wissen/foehn/` |
| gewitter bodensee radar zellen | N | Sommer | A18, A8 | `/wetterkarte/zellbahnen` |
| starkwindwarnung see | I | — | A20 | `/warnungen` (ehrlich: keine See-Sturmwarnleuchten) |
| windvorhersage attersee kite | L | — | A1 | Ortsseiten AT |
| böen vorhersage segeln | N | — | A3 | `/wetterkarte/boeen` |
| blitzkarte aktuell see | N | — | A8 | `/wetterkarte/blitze` |

## Zielgruppe 9 · Fotografie / Astronomie
| Suchbegriff | Int. | Situation | Feature | Zielseite |
|---|---|---|---|---|
| goldene stunde heute <ort> | L/I | täglich | E7 | Ortsseiten-Block „Sonnenzeiten" (E8), `/wissen/goldene-blaue-stunde/` (E5) |
| blaue stunde uhrzeit berechnen | I | — | E7 | dito |
| abendrot wahrscheinlichkeit heute | I | — | E7 | `/fuer/fotografen/` (E6) |
| nebel fotografieren vorhersage | I | Herbst | E7, G2 | dito |
| sternenhimmel heute klar | I/N | — | E8 | `/fuer/astronomie/` (E6) |
| lichtverschmutzung karte deutschland bortle | I | — | E8 | `/wissen/lichtverschmutzung-bortle/` (E5) — ehrlich: Schätzung |
| neumond klare nacht vorhersage | N | — | E8 | `/eventplanung/sterne` (E7) |
| milchstraße fotografieren wann | I | Sommer | E8 | `/fuer/astronomie/` (ehrlich: keine Milchstraßen-Sichtbarkeit) |
| wolkenkarte hoch mittel tief | N | — | A6 | `/wetterkarte/bewoelkung` (E1) |
| astrowetter | N | — | E8 | `/fuer/astronomie/` |

## Zielgruppe 10 · Pendler, Familie, Alltag, Gesundheit
| Suchbegriff | Int. | Situation | Feature | Zielseite |
|---|---|---|---|---|
| regenradar | N | — | A4, B1 | `/regenradar` |
| regnet es gleich | N | — | B4 | `/regenradar` |
| wetter <stadt> | L | — | A23 | `/wetter/<stadt>/` |
| wetter app ohne werbung ohne tracking | N | — | I | `/ohne-tracker/` (E3) |
| föhn kopfschmerzen heute | I | Alpenrand | G4 | `/fuer/wetterfuehlige/` (E6) |
| pollenflug heute | I | Frühjahr | A23 | Orts-FAQ (DE ja, AT/CH Negativ-Auskunft) |
| uv index heute | I | Sommer | A23 | Ortsseiten (DE amtlich, AT/CH geschätzt) |
| glätte morgen früh | I | Winter | B1 | `/regenradar` (Niederschlagsart) |
| wetterwarnung heute | N | — | A20 | `/warnungen` |
| wie zuverlässig ist die wettervorhersage | I | — | C2, C3, A27 | `/wissen/modellvergleich-unsicherheit/`, `/validierung` (E4) |

## Zielgruppe 11 · Wetter-Enthusiasten, Lehre, Medien
| Suchbegriff | Int. | Feature | Zielseite |
|---|---|---|---|
| icon-d2 erklärt auflösung | I | A21 | `/methodik/wettermodelle/` (E3, aus `modelCatalog.ts`) |
| wettermodelle vergleichen kostenlos | N | C1 | `/vorhersage` |
| klimastreifen <stadt> | I | F2 | `/wissen/klimastreifen/` (E5), Ortsseiten-Klimablock |
| hitzetage pro jahr <stadt> | I | F2 | Ortsseiten-Klimablock (E8) |
| updraft helicity karte | I | A17 | `/wetterkarte/rotation` (konservativ) |
| konrad dwd zellverfolgung | I | A18 | Glossar |
| wetterdaten dwd geosphere meteoschweiz lizenz | I | I3 | `/lizenzen/` |
| wind globus 3d | N | A26 | `/globus` |
| brier score wettervorhersage | I | A27 | `/validierung` |
| omega lage | I | Wetterlage | `/wetterlage/omega-lage-mitteleuropa/` |

**Abdeckung:** Jedes Inventar-Feature A1–I6 ist oben mindestens einer Zielgruppe und einem Suchbegriff
zugeordnet, außer: A7 Satellit (Standard, —), A13 Flow-Nowcast (durch Regenradar abgedeckt), B2/B7, D9/D10,
E9, G7/G8, H10/H12, I2/I4/I5/I6 — begründet **irrelevant** (Infrastruktur, Attrappe, zurückgezogen, Standard).

---
