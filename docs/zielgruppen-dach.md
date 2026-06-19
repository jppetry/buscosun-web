# buscosun — Zielgruppen DACH (von Grund auf, brutal ehrlich)

> Stand: 2026-06-09 · Methodik: Quellenabgleich aus **Code** (`src/`), **Docs/Lastenheften**
> (`docs/`, `*_feature/*.md`, `compass_artifact_*.md`) und **Mockups** (`mockups-v2/`,
> `history_feature/`, `3D_feature/`, `confidence_feature/`, `wind_feature/`, `mockups_tour/`,
> `mockup_2DLayer/`, `event_feature/`).
> Grundregel: **Es werden keine Features erfunden.** Was nur in Docs/Mockups steht, aber
> nicht im Code lebt, ist als _geplant_ markiert. Eignung wird ehrlich bewertet:
> ⭐ = trägt heute real · 🟡 = teilweise/mit Umweg · 🔻 = Lücke trotz naheliegendem Bedarf.

---

## Teil A — Was buscosun HEUTE wirklich kann (Feature-Inventar mit Status)

buscosun ist eine **reine Frontend-Web-App** (React/Vite, kein eigenes Backend; alle
Quellen werden client-seitig geholt/dekodiert). Region: **DE · AT · CH** (+ ~Randpuffer).

### SHIPPED (im Code, verlinkt, lauffähig)

| Feature (Kachel) | Was es real tut | Belege |
|---|---|---|
| **2D-Wetterkarte** (`map2d`) | Interaktive MapLibre-Karte, Layer: Wind (ICON-D2 u/v 10 m), Niederschlag (RADOLAN-RV DE / INCA AT / MeteoSwiss-rzc CH → ICON-D2), Temperatur (höhenkorrigiert), Wolken (tief/mittel/hoch), Satellit (Meteosat), Blitze (DWD Sferics, DE), Stationen (DWD/TAWES/SMN). Zeit-Slider, Modellwahl je Land, Punktforecast-Panel. Direkt-Einstieg ohne Ortssuche. | `src/MapView.tsx`, `src/sources/*`, `src/scalar/*`, `src/wind/WindLayer.ts` |
| **Tourenplanung** (`route`) | GPX/TCX/FIT/KML/KMZ-Upload, Höhenprofil, Wetter pro km **zur echten Ankunftszeit**, 8 Bewegungsarten (Wandern…Rennrad…E-Bike), **E-Bike-Akku-Reichweite**, Pausenplanung, Zeit-Scrubber, Karten-Wetter-Overlay. | `src/route/*` |
| **Event-Planung „bester Tag"** (`event`) | Anlass + Ort + Zeitfenster → 7-Tage-Score (0–100, anlass-bewusst), Phasen (z. B. Trauung/Empfang/Abendfeier einzeln bewertet), **Plan B** (Ausweichtag/-ort), Regen-/Wind-/Hitze-/Kälte-Hazards, **Foto-Licht** (golden/blue hour, Nebel-/Abendrot-Chance), **Astro-Nacht** (Mond, Dunkelheit, Tau, Lichtverschmutzung), eingebettete 2D-Karte + Tagesablauf-Diagramm. | `src/event/*`, `src/photo/*`, `src/astro/*` |
| **Nowcast** (`nowcast`) | 6-h-Niederschlag: 0–2 h Radar (RADOLAN-RV/INCA/rzc), 2–6 h ICON-D2; minutengenaue Timeline, Radarkarte, Akkumulation, **Blitz-/Sturm-Alerts**, **alpine Tal-/Grat-Trennung** (Schneefallgrenze). | `src/nowcast/*` |
| **Vorhersage / Modellvergleich** (`forecast`) | Multi-Modell (ICON-D2 + MOSMIX + ICON-EU), **Unsicherheitsband/Spread**, Konfidenz-Karten pro Tag, **Trefferquoten-Rückblick (Hit-Rate)**, Einfach/Experte-Umschalter. | `src/confidence/*` |
| **Historie** (`history`) | ERA5-Reanalyse (Open-Meteo Archive, bis ~1940): Warming-Stripes, Anomalien, Kenntage (Frost/Eis/Sommer/Hitze), Kalender-Heatmap, Rekorde, Trendlinien, Drill-down, Windrose. | `src/history/*` |
| **3D-Wetter** (`threed`) | Vertikal-Schnitt entlang frei gezogener Linie: Höhenwind (AGL), Temperatur, Wolkenschichten, **Inversion**, Windscherung, **Föhn-Durchgriff**; Gelände-Modus, Zeit-Animation, Tour-Import. | `src/threed/*` |
| **3D-Globus** (`globe`) | Drehbare Erdkugel, Wind-Partikel + Temperatur-Overlay (nullschool-Stil). **Achtung: gebündelte Public-Domain-Sample-Felder (NASA MERRA-2 Monatsmittel + GFS-Sample), KEINE Live-Vorhersage.** | `src/globe/*` |
| **KI-Meteorologe** (`assistant`) | Lokales LLM (WebLLM/WebGPU, läuft im Browser), erklärt Phänomene **gegroundet** aus der Punktforecast-Pipeline (Föhn, Inversion, Höhenwind, Modell-Unsicherheit). Braucht WebGPU. | `src/assistant/*` |

**Fundament (kein eigenes Tile, trägt aber fast alles):** Punktforecast-Pipeline mit
lead-time-gewichtetem Quellen-Blend, **Höhenkorrektur** (Lapse-Rate + Terrarium-DEM),
**Föhn-Detektor**, **Niederschlagsart** (Regen/Schnee/Schneeregen via Schneefallgrenze),
**gefühlte Temperatur**, Fusions-Engine (IDW+Barnes). Belege: `src/pointForecast/*`, `src/fusion/*`.

### IN-PROGRESS / unfertig

- **Benachrichtigungen**: Logik + UI vorhanden, aber **NULL_BACKEND** — funktioniert nur als
  In-App-Hinweis, solange die App offen ist. **Kein echtes Push** bei geschlossener App.
  `src/notifications/*`. → „Stell-ein-und-vergiss"-Alerting existiert real **nicht**.

### PLANNED / nur in Docs & Mockups (NICHT im Code)

- `dayflow` („Tagesablauf"/24-h-Strip): Feature-ID existiert, aber **keine Seite, keine Kachel** → toter Platzhalter (Mockup `mockups-v2/18-tagesablauf-24h.svg`).
- **Strava-OAuth-Import** (Mockup `12-strava-oauth.svg`) — nicht implementiert.
- **Skew-T / Profi-Datacenter-Layer** (`20-skew-t…`, `22–25-datacenter-*`) — nicht implementiert.
- 3D-Epics C/D (Lee-Wellen/Rotoren-Tiefe), Confidence Stufe 4 (volle Verifikation), History-Profi-Indizes — laut Docs Roadmap, im Code nur teils/Grundausbau.
- **`climate` (Langfrist & Klima) wurde gelöscht** — existiert nicht mehr (bewusst entfernt).

### Harte Ehrlichkeits-Grenzen (gelten querschnittlich für ALLE Zielgruppen)

1. **UV-Index, Pollen, amtliche Warnungen (DWD CAP): nur Deutschland.** AT/CH bekommen das **nicht**.
2. **AT/CH Raster-/Karten-Horizont nur ~1–2 Tage** (ICON-D2/AROME/INCA); weiter draußen nur Punkt-Blend.
3. **Globus = Sample-Daten**, keine echte globale Live-Vorhersage.
4. **Kein offizielles Briefing.** Keine METAR/TAF, kein Lawinenlagebericht, kein Seegang/Welle — alles nur Modell-/Heuristik-Kontext, rechtlich **nicht** für sicherheitskritische/behördliche Entscheidungen geeignet.
5. **Kein Backend → kein zuverlässiges Push, keine Accounts/Sync**, nur `localStorage`.
6. **Open-Meteo-Rate-Limit**: unter Last Fallback auf BrightSky-only (DE-lastig).
7. Wind-/Wetterdaten auf der Karte sind **Modellfelder** (z. T. eingegrenzte Bbox); kein Tile-Caching.

---

## Teil B — Zielgruppen DACH (Mainstream → Nische → Long-Tail)

JTBD = Job to be done. Eignung: ⭐/🟡/🔻 (s. o.).

### 1 · Berg & Alpin

| Zielgruppe | JTBD | Reale Features | DACH-Spezifika | Eignung |
|---|---|---|---|---|
| Tages-/Genusswanderer | „Wird's auf meiner Tour nass/kalt?" | Tourenplanung, Nowcast, 2D-Karte | Höhenkorrektur Tal↔Grat, Niederschlagsart, Föhn (AT/CH) | ⭐ |
| Hochtouren-/Bergsteiger | Wetterfenster + Vereisung/Wind am Grat | Tourenplanung, 3D-Wetter (Höhenwind/Inversion), Nowcast (alpine Tal/Grat-Split) | Schneefallgrenze (AT/CH), Grat-Hochrechnung | 🟡 (kein Lawinen-/Profi-Briefing) |
| Klettersteig-Geher | Trockenheit + Gewitter-Risiko (Stahlseil!) | Nowcast (Blitz, DE), Event („bester Tag") | Gewitter/Sferics nur DE; Föhn | 🟡 (Blitz-Layer DE-only) |
| Fels-/Sportkletterer (outdoor) | Trockener Fels, Reibung, kein Regen die Nacht davor | Event-Score, Nowcast, Historie (Trockenneigung) | Höhenkorrektur | 🟡 (keine „Felsfeuchte") |
| Skitourengeher / Variantenfahrer | Neuschnee, Wind-Verfrachtung, Sicht | Nowcast (Schneefallgrenze, Neuschnee-Äquiv. grob), 3D (Wind/Inversion) | alpine Tal/Grat-Split, Föhn | 🔻 (**kein Lawinenlagebericht** — nur Wetterkontext) |
| Pisten-Skifahrer/Snowboarder | „Welcher Tag/Welches Gebiet lohnt?" | Event-Score, 2D-Karte, Historie | Schneefallgrenze (AT/CH) | 🟡 (keine Lift-/Schneehöhen-Daten) |
| Trailrunner / Weitwanderer (E5, Alpenüberquerung) | Mehrtages-Fenster + Etappen-Timing | Tourenplanung (ETA pro km), Vorhersage-Konfidenz | Höhenkorrektur | ⭐ |
| Hüttenwirte / Bergrettung / Bergführer (B2B) | Betrieb/Einsatz planen | 3D Go/No-Go (Mockup vorhanden), Nowcast, Vorhersage | Föhn, Schneefallgrenze | 🟡 (B2B-Tooling nur Mockup, kein Account) |
| Pilz-/Kräutersammler, Geocacher | „Trockenes Zeitfenster heute?" | Nowcast, Event | — | 🟡 |

### 2 · Luftsport & Drohnen

| Zielgruppe | JTBD | Reale Features | DACH-Spezifika | Eignung |
|---|---|---|---|---|
| Gleitschirm-/Drachenflieger | Höhenwind, Inversion, Föhn, Böigkeit | **3D-Wetter (Höhenwind AGL, Inversion, Föhn, Shear)**, Punktforecast (Böen, gefühlt) | Föhn-Detektor (AT/CH), Inversion-Füllstand | ⭐ (eines der stärksten Match-Features) |
| Segel-/Modellflieger | Thermik-/Windkontext | 3D-Wetter, 2D Wind-Layer | Höhenwind 850/700/500 hPa | 🟡 (keine Thermik-Prognose) |
| FPV-/Hobby-Drohnenpiloten | „Darf/kann ich fliegen?" (Wind/Böen/Regen) | Punktforecast Böen, Nowcast, Event-Score | gefühlte Temperatur, Böen | ⭐ |
| Kommerzielle Drohnen (Vermessung/Film) (B2B) | Go/No-Go nach Windgrenze | 3D Go/No-Go (Mockup), Punktforecast | Höhenwind | 🟡 (Mockup, kein B2B-Backend) |
| Privatpiloten/Ballonfahrer | Lagebild | 3D, Karte, Globus | Föhn | 🔻 (**kein METAR/TAF, kein legales Briefing**) |

### 3 · Wasser & Seen (DACH = Binnengewässer)

| Zielgruppe | JTBD | Reale Features | DACH-Spezifika | Eignung |
|---|---|---|---|---|
| Segler/Surfer/Kiter (Bodensee, Attersee, Genfersee …) | Wind/Böen-Fenster | 2D Wind-Layer, Punktforecast (Böen), Nowcast | Föhn-Böen (relevant für Alpenseen!) | 🟡 (**kein Wellen-/Seegangsmodell, keine Sturmwarn-Spezifik See**) |
| SUP/Kanu/Kajak/Ruderer | Ruhiges Fenster, kein Gewitter | Nowcast (Blitz DE), Event-Score | — | 🟡 |
| Angler | Druck/Wind/Regen-Fenster | Punktforecast, Nowcast | — | 🟡 (kein Luftdruck-Trend-Feature explizit) |
| Badeseen-/Freibadgänger | „Heute baden?" | Event-Score (Baden-Anlass), 2D-Karte | gefühlte Temp, UV (DE) | ⭐ (DE) / 🟡 (AT/CH ohne UV) |

### 4 · Rad & Motor

| Zielgruppe | JTBD | Reale Features | DACH-Spezifika | Eignung |
|---|---|---|---|---|
| Rennrad/Gravel/MTB | Wetter entlang der Strecke | **Tourenplanung** | Höhenkorrektur (Pässe) | ⭐ |
| **E-Bike-Tourer** | Reichweite + Wetter | **Tourenplanung mit E-Bike-Akku-Panel** | Steigung × Akku, Höhe | ⭐ (Alleinstellungs-Match) |
| Bikepacking | Mehrtages-Fenster | Tourenplanung + Vorhersage-Konfidenz | — | ⭐ |
| Motorradfahrer / Cabrio / Oldtimer-Ausfahrt | Trockene, milde Pass-Tour | Tourenplanung, Event, Nowcast | Höhenkorrektur (Pässe), Föhn | ⭐ |

### 5 · Laufen & Fitness

| Zielgruppe | JTBD | Reale Features | DACH-Spezifika | Eignung |
|---|---|---|---|---|
| Jogger/Läufer | Kühles, trockenes Fenster | Event-Score (Laufen-Anlass, gefühlte Temp), Nowcast | gefühlte Temperatur, UV (DE) | ⭐ |
| Marathon-/Lauf-Event-Teilnehmer | Renntag-Bedingungen | Event-Score, Vorhersage-Konfidenz | — | ⭐ |

### 6 · Events, Feiern, Foto, Astro

| Zielgruppe | JTBD | Reale Features | DACH-Spezifika | Eignung |
|---|---|---|---|---|
| **Hochzeitspaare (Freiluft)** | Bester Tag + Plan B + Phasen | **Event: Phasen (Trauung/Empfang/Abendfeier), Plan B, Regen/Wind/Hitze-Hazards** | gefühlte Temp, Höhe | ⭐ (Kern-Use-Case) |
| Hochzeits-/Eventplaner, Open-Air-Veranstalter, Festivals (B2B) | Termin-Risiko, Auf-/Abbau-Wind | Event-Score + Phasen, Nowcast, Vorhersage-Konfidenz | Warnungen (DE) | 🟡 (kein B2B-Account/Export, Warnungen DE-only) |
| Gastro mit Außenbereich / Biergarten / Schanigarten (AT) / Foodtrucks | „Lohnt sich heute draußen?" | Event-Score, Nowcast | gefühlte Temp | 🟡 (kein Umsatz-/Gäste-Bezug) |
| Landschafts-/Hobbyfotografen | Goldene/blaue Stunde, Nebel, Abendrot | **Event → Foto-Licht** (Sonnenstand, Wolken-Mood, Nebel-/Abendrot-Chance) | — | ⭐ |
| Astrofotografen / Hobby-Astronomen / Sternfreunde | Klare, dunkle, mondarme Nacht | **Event → Astro-Nacht** (Mondphase, astronom. Dunkelheit, Bewölkung, **Lichtverschmutzung**, Tau) | — | ⭐ |
| Polarlicht-/Sternschnuppen-Jäger | „Heute Nacht klar?" | Astro-Nacht (Wolken/Dunkelheit) | — | 🔻 (**keine Aurora-/Meteorstrom-Prognose** — nur Wolken+Dunkelheit) |
| Filmcrews / Location-Scouts (B2B) | Dreh-Wetterfenster | Event, 2D-Karte, Historie | — | 🟡 |

### 7 · Garten, Land, Tier

| Zielgruppe | JTBD | Reale Features | DACH-Spezifika | Eignung |
|---|---|---|---|---|
| Hobbygärtner / Schrebergärtner | Frost?/Gießen?/Aussaat-Fenster | Nowcast (Regen), Event, **Historie (Frost-/Kenntage)** | Niederschlagsart, gefühlte Temp | 🟡 (keine echte „Frostwarnung morgen" als Alert; Push fehlt) |
| Imker | Flugwetter der Bienen | Punktforecast (Temp/Wind/Regen) | — | 🟡 |
| Hunde-/Pferdebesitzer, Reitställe | Gassi-/Ausreit-Fenster, Hitzeschutz | Nowcast, Event, gefühlte Temp | Hitze (UV DE) | 🟡 |
| Landwirte / Winzer / Obstbauern (B2B) | Heuernte, Spritzfenster, Frost, Hagel, Reife | Nowcast, Historie, Vorhersage | Frosthistorie | 🔻 (**keine Agrar-Features**: kein GDD, Bodenfeuchte, Spritzfenster, Hagel-Prognose) |

### 8 · Pendler, Familie, Alltag, Gesundheit

| Zielgruppe | JTBD | Reale Features | DACH-Spezifika | Eignung |
|---|---|---|---|---|
| Pendler (Rad/Auto/ÖPNV) | „Werde ich auf dem Weg nass?" | **Nowcast (0–6 h)**, 2D-Karte | — | ⭐ (DE/AT/CH, Radar je Land) |
| Familien/Eltern | Spielplatz-/Ausflugsfenster | Event-Score, Nowcast | UV (DE) | ⭐ (DE) / 🟡 (AT/CH ohne UV) |
| **Pollenallergiker** | „Wie ist die Belastung?" | **Pollen-Index (8 Arten)** | **nur DE!** | ⭐ DE / 🔻 **AT/CH = Lücke** |
| Wetterfühlige / Föhn-Geplagte | Föhn-Vorwarnung (Kopfschmerz) | **Föhn-Detektor**, Punktforecast | Föhn (AT/CH/Alpenrand) | ⭐ (eines der ehrlichsten DACH-Nischen-Matches) |
| Senioren | Hitze/Glätte | gefühlte Temp, Nowcast, Warnungen (DE) | UV/Warnungen DE-only | 🟡 |

### 9 · Reise & Tourismus

| Zielgruppe | JTBD | Reale Features | DACH-Spezifika | Eignung |
|---|---|---|---|---|
| Tagesausflügler / Wochenend-/Brückentag-Planer | „Welcher Tag/Welche Region?" | Event-Score, 2D-Karte, Historie (typische Neigung) | — | ⭐ |
| Camper / Wohnmobilisten / Zelter | Stellplatz-Wetterfenster, Sturm | Event, Nowcast, Vorhersage | Föhn/Böen | 🟡 |
| Tourismusbüros / Bergbahnen / Freizeitparks (B2B) | Besucher-/Betriebsplanung | Vorhersage, Event, Historie | — | 🔻 (kein B2B-Produkt/Embed/Account) |

### 10 · Winter-spezifisch

| Zielgruppe | JTBD | Reale Features | DACH-Spezifika | Eignung |
|---|---|---|---|---|
| Winterdienst / Hausmeister / Straßenmeisterei (B2B) | Glätte/Schneefall-Timing | Nowcast (Niederschlagsart, Schneefallgrenze), 2D | Tal/Grat-Split | 🟡 (kein Glätte-/Streumodell, kein Alert) |
| Langläufer / Rodler / Natureisläufer | Schnee-/Frost-Fenster | Nowcast, Historie, Event | Schneefallgrenze (AT/CH) | 🟡 |

### 11 · Bau, Handwerk, Forst (B2B / Profi)

| Zielgruppe | JTBD | Reale Features | DACH-Spezifika | Eignung |
|---|---|---|---|---|
| Kranführer / Kranverleih | Windgrenze (Go/No-Go) | **3D Go/No-Go (Mockup)**, Punktforecast (Böen), Höhenwind | Höhenwind 10 m…500 hPa | 🟡 (Mockup, kein zertifiziertes B2B-Tool) |
| Dachdecker/Gerüst/Fassade/Maler | Trocken-/Wind-/Frostfenster | Nowcast, Event, Vorhersage | Niederschlagsart, Warnungen (DE) | 🟡 |
| Baustellenleiter (Beton/Frost) | Frost-/Regenrisiko Planung | Nowcast, Historie, Vorhersage | Frost | 🟡 |
| Forst/Waldarbeiter | Sturm/Windwurf | Vorhersage, Nowcast, Warnungen (DE) | Böen | 🟡 (Warnungen DE-only) |

### 12 · Bildung, Wissenschaft, Medien, Enthusiasten

| Zielgruppe | JTBD | Reale Features | DACH-Spezifika | Eignung |
|---|---|---|---|---|
| Hobby-Meteorologen / Wetter-Nerds | Modelle vergleichen, Phänomene verstehen | **Vorhersage/Spread, 3D-Wetter, KI-Meteorologe, Stationen-Layer** | Föhn, Inversion, ICON-D2/EU/MOSMIX | ⭐ (klares Enthusiasten-Produkt) |
| „Stimmt die Vorhersage?"-Skeptiker | Ehrliche Treffsicherheit | **Konfidenz + Hit-Rate-Rückblick** | — | ⭐ (selten ehrlich umgesetzt) |
| Klima-Interessierte / Aktivisten | Erwärmung am eigenen Ort zeigen | **Historie: Warming-Stripes, Anomalien, Kenntage-Trends** (ERA5) | — | ⭐ |
| Lehrer / Schüler / Studierende (Geo/Meteo) | Anschauungsmaterial | Historie, 3D, Globus, KI-Meteorologe | — | ⭐ |
| Journalisten / Wetter-Blogger / Content-Creator | Erklärgrafiken, Visuals | Historie, Globus (Visual), 3D, Screenshots | — | 🟡 (kein Export/Embed-Workflow außer Permalink) |

### 13 · Long-Tail / echte Nischen

| Zielgruppe | JTBD | Reale Features | Eignung |
|---|---|---|---|
| Grill-/Lagerfeuer-/Open-Air-Kino-Planer | windstilles, trockenes Fenster | Event (Grillen-Anlass: „offene Flamme") | ⭐ |
| Drachensteigen (Familie) / Slackliner / Highliner | Wind im richtigen Maß | Punktforecast Böen, 2D Wind | 🟡 |
| Bogenschützen / Disc-Golf / Outdoor-Schützen | Windruhe | Punktforecast, Event | 🟡 |
| Eiskletterer | Dauerfrost-Fenster | Historie, Nowcast (T<0), 3D | 🟡 |
| Vogelbeobachter / Birder | Zugvogel-/Sichtwetter | Punktforecast, Wind-Layer | 🔻 (keine Zugvogel-/Sicht-Spezifik) |
| Jäger (Ansitz) | Windrichtung (Witterung) | 2D Wind-Layer, Punktforecast (Windrichtung) | 🟡 |
| Survival/Bushcraft/Wildcamper | Nachtkälte, Regen, Sturm | Event, Nowcast, gefühlte Temp | 🟡 |
| Heißluftballon-/Drachen-Festivals (B2B) | Wind-Go/No-Go | 3D, Punktforecast | 🟡 |
| PV-Anlagenbesitzer (Hobby) | Ertrags-„Gefühl" | 2D Wolken/Sonne, Vorhersage | 🔻 (**kein PV-Ertragsmodell**) |
| Feuerwehr/THW (ehrenamtlich) | Unwetter-Lagebild | Nowcast, Warnungen (DE), Vorhersage | 🔻 (kein behördentaugliches Warntool; Warnungen DE-only) |

---

## Teil C — Brutal ehrliches Fazit

### Wen buscosun HEUTE wirklich stark bedient (Kern)
- **DACH-Bergsport & Touren** (Wandern, Rad/E-Bike, Motorrad): Tourenplanung + Höhenkorrektur + ETA pro km ist real und gut. **E-Bike-Akku** ist ein echtes Alleinstellungsmerkmal.
- **Gleitschirm/Drohne/Höhenwind-Interessierte**: 3D-Höhenwind + Inversion + Föhn ist ungewöhnlich tief und passt exakt.
- **Event-/Hochzeits-/Foto-/Astro-Planung**: Phasen + Plan B + Foto-Licht + Astro-Nacht sind ausgereift und differenzierend.
- **Pendler & „Regen jetzt?"**: Nowcast 0–6 h mit länderspezifischem Radar.
- **Wetter-Enthusiasten & Skeptiker & Klima-Neugierige**: Spread/Hit-Rate, KI-Meteorologe, Warming-Stripes — ehrliche, seltene Features.
- **Föhn-Geplagte**: echter Föhn-Detektor — eine sehr DACH-spezifische Nische.

### Wo es trotz naheliegendem Bedarf NICHT trägt (ehrliche Lücken)
1. **AT & CH zweite Klasse bei UV, Pollen, amtlichen Warnungen** (alles DE-only). Allergiker/Gesundheit/Behörden in AT/CH werden schlecht bedient.
2. **Kein echtes Push/Alerting** (NULL_BACKEND) → „warne mich morgens vor Frost/Regen" funktioniert nicht zuverlässig. Trifft Gärtner, Pendler, Winterdienst, Baustellen.
3. **Sicherheitskritische Profis nur als Kontext, nicht als Briefing**: Lawinen (kein Lagebericht), Luftfahrt (kein METAR/TAF), Schifffahrt/See (kein Seegang/Welle), Feuerwehr/Katastrophenschutz (kein behördentaugliches Tool).
4. **Kein B2B-Produkt**: keine Accounts, kein Export/Embed/API, keine SLA. Tourismus, Veranstalter, Bau, Kran, Hütten sind heute nur über die generische Web-UI bedient (Go/No-Go existiert nur als Mockup).
5. **Keine domänenspezifischen Modelle**: keine Agrar-Features (GDD, Bodenfeuchte, Spritzfenster, Hagel), kein PV-Ertrag, keine Thermik-/Aurora-Prognose, keine Schneehöhen/Lift-Status.
6. **Globus ist Deko** (Sample-Daten), kein globales Vorhersage-Tool — Reisende „weltweit" werden nicht bedient.

### Einordnung
buscosun ist heute am ehrlichsten ein **DACH-Outdoor-/Planungs-Companion für versierte
Privatnutzer** (Bergsport, Rad/E-Bike, Event/Hochzeit/Foto/Astro, Pendler, Wetter-Nerds)
— mit einer ungewöhnlich tiefen alpinen/Höhen-Komponente und ehrlicher Unsicherheits-Kommunikation.
Es ist **kein** B2B-/Behörden-/Profi-Briefing-Produkt und (mangels Backend/Push) **kein**
zuverlässiges Alarmierungs-Tool. Die größten realistischen Ausbau-Hebel für mehr Zielgruppen:
echtes Push-Backend, AT/CH-Parität bei UV/Pollen/Warnungen, und ein B2B-Layer (Accounts/Export/Go-No-Go).
