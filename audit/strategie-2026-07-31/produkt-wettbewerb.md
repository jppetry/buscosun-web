# Produkt & Wettbewerb — Strategie-Deep-Dive (2026-07-31)

> Rolle: **Produkt & Wettbewerb** (`agents.md` §2) · Planungsphase, keine Code-Änderungen.
> Auftrag: `roadmap.md` §C per Web-Recherche verifizieren und vertiefen; Differenzierungs-These prüfen;
> Priorisierung (§D) und Zielgruppen (`docs/zielgruppen-dach.md`) revidieren.

---

## 1. Auftrag, Methodik & Belegdisziplin

### 1.1 Methodik

Drei Belegquellen, strikt getrennt gehalten:

1. **Code** — Aussagen über buscosun sind ausschließlich am Quellcode belegt (`Datei:Zeile`).
   Zwei read-only Verifikationsläufe (2026-07-31) haben 15 behauptete Alleinstellungen und
   20 Table-Stakes-Merkmale einzeln gegen `src/` geprüft. **Alt-Doku wurde nicht als Beleg akzeptiert.**
2. **Web** — Wettbewerber-Aussagen mit Quell-URL + Abrufdatum. Wo nur Drittquellen (Blogs,
   App-Store-Beschreibungen, Foren) vorlagen, ist das ausgewiesen.
3. **Nicht verifiziert** — explizit als solches markiert. Es wird nichts geschätzt oder plausibilisiert.

**Wichtige Einschränkung:** Der Wissensstand des Modells reicht bis Mai 2026; alle Zahlen zu
Preisen, Nutzerzahlen und Funktionsumfang stammen aus Web-Abrufen vom **2026-07-31**, sind aber
teils selbst undatiert (App-Store-Texte, Blog-Guides). Preise sind volatil und **vor jeder
Entscheidung neu zu prüfen**. Nutzerzahlen sind fast durchweg **Eigenangaben der Anbieter**
(kein AGOF/IVW-Abgleich verfügbar) — sie taugen für Größenordnungen, nicht für Marktanteile.

### 1.2 Genutzte Quellen (alle abgerufen 2026-07-31)

| # | Quelle | URL | Datum der Quelle |
|---|---|---|---|
| Q1 | Kachelmannwetter — Abo-Modelle | `https://wetterkanal.kachelmannwetter.com/das-abo-auf-kachelmannwetter-com/` | undatiert |
| Q2 | Kachelmannwetter — Werbung ausschalten / Pakete | `https://kachelmannwetter.com/de/info/werbung-ausschalten` | undatiert |
| Q3 | Kachelmannwetter — Modellkarten (ECMWF/ICON/GFS/UKMO/GEM), „Mitteleuropa Super HD" 1×1 km | `https://kachelmannwetter.com/de/modellkarten` | undatiert |
| Q4 | Kachelmann Wetterkanal — „Wettermodell-Vergleich und Ensembles zum Hitze-Check" | `https://wetterkanal.kachelmannwetter.com/45-grad-in-der-wetter-app-besser-wettermodell-vergleich-und-ensembles-zum-hitze-check/` | undatiert |
| Q5 | ADZINE — „Wetteronline feiert 30-jähriges Bestehen" (≈20 Mio. monatl. Nutzer DE, ≈40 Mio. weltweit, >250 Mio. App-Downloads, ≈1 Mrd. Visits/Monat — **Eigenangaben**) | `https://www.adzine.de/2026/07/wetter-als-reichweitentreiber-wetteronline-feiert-30-jaehriges-bestehen/` | 07/2026 |
| Q6 | netzpolitik.org — „Wegen Handy-Standortdaten: Wetter Online droht Bußgeld" | `https://netzpolitik.org/2026/wegen-handy-standortdaten-wetter-online-droht-bussgeld/` | **2026-04-07** |
| Q7 | Stiftung Warentest — „Wetter-Apps: Sechs von acht kritisch beim Datenschutz" | `https://www.test.de/Wetter-Apps-Sechs-von-acht-kritisch-beim-Datenschutz-4542824-0/` | undatiert |
| Q8 | mobilsicher.de — „Wetter-Apps: Nur zwei empfehlen wir" (u. a. 26 Tracker in Weather Underground) | `https://mobilsicher.de/apptest/wetter-apps-nur-zwei-empfehlen-wir` | undatiert |
| Q9 | ProSiebenSat.1 — Verkauf wetter.com an FUNKE Mediengruppe | `https://www.prosiebensat1.com/en/newsroom/prosiebensat1-sells-wettercom-to-funke-mediengruppe-601127` | 2025-12-15 |
| Q10 | DWD — WarnWetter-App (Gratisumfang, In-App-Kauf wegen BGH-Urteil 12.03.2020) | `https://www.dwd.de/DE/leistungen/warnwetterapp/warnwetterapp.html` | undatiert |
| Q11 | BBK — Warn-App NINA | `https://www.bbk.bund.de/DE/Warnung-Vorsorge/Warn-App-NINA/warn-app-nina_node.html` | undatiert |
| Q12 | MeteoSwiss App (App Store CH) — 4,8 Mio. Geräte, v3.5.3, MTG-Satellit, Push-Naturgefahrenwarnungen | `https://apps.apple.com/ch/app/meteoswiss/id589772015` | Update 2026-06-16 |
| Q13 | MeteoSchweiz Blog — „Open Government Data — Lokalprognosedaten und Radardaten verfügbar" | `https://www.meteoschweiz.admin.ch/ueber-uns/meteoschweiz-blog/de/2026/01/open-government-data-lokalprognosedaten-und-radardaten-verfuegbar.html` | 01/2026 |
| Q14 | MeteoSwiss — Open Data Doku (API, maschinenlesbar, kostenlos, seit 22.05.2025) | `https://opendatadocs.meteoswiss.ch/` | laufend |
| Q15 | GeoSphere Austria Data Hub — Datensatz **Warnungen v1**, **CC BY 4.0**, öffentliche API, keine Registrierung, Hochalpin ausgenommen | `https://data.hub.geosphere.at/dataset/warnungen-v1` | laufend |
| Q16 | GeoSphere Austria — Gesundheitswetter (Pollen, UV, Luftschadstoffe) | `https://www.geosphere.at/de/karten/gesundheitswetter` | laufend |
| Q17 | polleninformation.at — Data Interface / API (persönlicher API-Key auf Anfrage, Attributionspflicht, deckt AT/DE/CH u. a.) | `https://www.polleninformation.at/en/data-interface` | laufend |
| Q18 | pollenundallergie.ch — MeteoSchweiz betreibt nationales Pollenmessnetz (14 Stationen), stündliche Auflösung | `https://www.pollenundallergie.ch/polleninformationen/pollendaten/infos-pollenmessungen` | laufend |
| Q19 | bergfex Ski-App — 9.500+ Webcams, Schneehöhen, Pistenpläne, PRO-Abo | `https://www.bergfex.com/c/ski-app/` | laufend |
| Q20 | Windy Premium — Preise/Features (Drittquelle, Bootsschule-Guide 2026) | `https://bootsschule1.de/blog/windy-com-guide-2026/` | 2026 |
| Q21 | Windy — Modell-Portfolio (ECMWF, GFS, ICON, NEMS, AROME, UKV, ICON-EU, ICON-D2) | `https://www.windy.com/` | laufend |
| Q22 | meteoblue — point+ Website-Abos | `https://content.meteoblue.com/de/privatkunden/website-subscriptions/point` | laufend |
| Q23 | meteoblue — Wikipedia (Spin-off Uni Basel 2006, 40+ Modelle, eigene KI, Kunden Agrar/Solar/Wind) | `https://en.wikipedia.org/wiki/Meteoblue` | laufend |
| Q24 | Ventusky (InMeteo) — Play-Store-Beschreibung: „frei von Werbung und Tracking-Skripten", Premium-Layer | `https://play.google.com/store/apps/details?id=cz.ackee.ventusky` | laufend |
| Q25 | Yr (NRK + MET Norway) — kostenlos, 12 Mio. Downloads, 90-min-Nowcast, Pollen/UV/Luftqualität | `https://www.yr.no/en` | laufend |
| Q26 | Google DeepMind — WeatherNext 2 (treibt Google Suche, Gemini, Pixel Weather, Maps Weather API) | `https://deepmind.google/science/weathernext/` | laufend |
| Q27 | ECMWF — „AI forecasts become operational" (AIFS operativ seit 25.02.2025; v1.1.0 seit 27.08.2025; ENS operativ seit 01.07.2025; Open Data) | `https://www.ecmwf.int/en/about/media-centre/news/2025/ecmwfs-ai-forecasts-become-operational` | 2025 |
| Q28 | EAWS / avalanche.report — europäischer Lawinenlagebericht | `https://avalanche.report/` · `https://www.avalanches.org/` | laufend |
| Q29 | burnair.ch — MeteoService (Gleitschirm-Prognosen, Abo) | `https://www.burnair.ch/meteoservice/` | laufend |
| Q30 | Windfinder Pro (App Store) — 160.000 Spots, 21.000 Messstationen, Freemium | `https://apps.apple.com/de/app/windfinder-pro-wind-wetter/id336901296` | laufend |
| Q31 | Pflotsh SuperHD — „Central Europe Super HD" 1×1 km DACH, Abo-Pflicht, 3 Modelle nebeneinander | `https://pflotsh.com/de/superhd.html` | laufend |
| Q32 | Zoom Earth — Radar-Nowcast bis 60 min | `https://zoom.earth/maps/radar/` | laufend |
| Q33 | RainToday (WeatherPro/DTN) — kostenloser Echtzeit-Regenwarner mit HD-Radar | `https://raintoday.weatherpro.de/lang/de.html` | laufend |
| Q34 | iphone-ticker — WeatherPro wird von DTN nicht mehr weiterentwickelt | `https://www.iphone-ticker.de/wetter-app-weatherpro-wird-nicht-mehr-weiterentwickelt-162408/` | undatiert |
| Q35 | SkyDemon — VFR-Flugplanung, dekodierte METAR/TAF/GAFOR | `https://www.skydemon.aero/plan/` | laufend |
| Q36 | komoot Tour-Wetter — nur mit Premium (Drittquelle NETZWELT) | `https://www.netzwelt.de/navigation/komoot/komoot-so-nutzt-funktion-tour-wetter-optimale-wettervorhersage.html` | undatiert |
| Q37 | wetter.com — Routenwetter | `https://www.wetter.com/reise/routenwetter/` | laufend |
| Q38 | wetter.com — „Prognosequalität & Verifikation" (misst intern; **keine Trefferquote in der App sichtbar**) | `https://www.wetter.com/news/ueber-uns-expertise-daten-qualitaet-verifikation_aid_6a33ddf16335044be70d9f6a.html` | undatiert |
| Q39 | BFSG / European Accessibility Act — Pflicht ab 28.06.2025, EN 301 549 → WCAG 2.1 AA, Erklärung zur Barrierefreiheit, Kleinstunternehmen ausgenommen | `https://bfsg-gesetz.de/` · `https://www.ihk.de/stuttgart/fuer-unternehmen/recht-und-steuern/it-recht/barrierefreie-webseiten-6200594` | 2025 |
| Q40 | Climate Reanalyzer (Univ. of Maine) — freie Klimavisualisierung | `https://climatechange.umaine.edu/climate-matters/climate-reanalyzer/` | laufend |
| Q41 | Epic Ride Weather / WattWeather — Radwetter entlang der Route | `https://wattweather.com/` · `https://bergauf.cc/epic-ride-weather-die-perfekte-wetter-app-fuer-radsportler/` | undatiert |

### 1.3 Belegdisziplin: was ich **nicht** verifizieren konnte

- **Marktanteile DACH** — keine belastbare, unabhängige Quelle gefunden (AGOF/IVW nicht abrufbar). Alle Reichweitenzahlen sind Eigenangaben (Q5, Q12) → nur als Größenordnung nutzbar.
- **Aktuelle Preise** Kachelmann (Q1/Q2), Windfinder (Q30), meteoblue point+ (Q22) — nicht am Anbieter-Checkout verifiziert; Windy-Preis (Q20) stammt aus einem Drittanbieter-Guide.
- **Nutzerzahlen AT/CH** für ORF-Wetter, wetter.at, SRF Meteo — nicht auffindbar.
- **Ob Windy/meteoblue einen frei ziehbaren Vertikalschnitt anbieten** — nicht abschließend geprüft (Windy hat Sounding/Airgram; ein „Schnitt entlang einer gezeichneten Linie" wurde nicht bestätigt oder widerlegt).
- **Ob meteoblue eine nutzersichtbare Trefferquote zeigt** — nicht verifiziert (meteoblue führt „Vorhersage-Zuverlässigkeit"-Indikatoren; ob das ein retrospektiver Hit-Rate-Wert ist, bleibt offen).

---

## 2. Wettbewerbs-Landkarte DACH

Legende Tracking-/Werbelast: **hoch** = Werbebanner + Drittanbieter-Tracker belegt · **mittel** = Werbung/Abo-Mischung · **niedrig** = werbefrei oder amtlich · **n. v.** = nicht verifiziert.

| Anbieter | Land / Reichweite | Kern-Stärke | Geschäftsmodell | Tracking-/Werbelast | Was buscosun kontern kann | Was buscosun lernen sollte | Quelle |
|---|---|---|---|---|---|---|---|
| **Kachelmannwetter** | DE/AT/CH, Enthusiasten-Kern | Modellvielfalt (ECMWF/ICON/GFS/UKMO/GEM), Ensembles, exklusives „Mitteleuropa Super HD" 1×1 km, exzellente Radar-/Blitzkarten, Ehrlichkeits-Kultur | Werbung + 4 Abos (Werbefrei / Plus / Kombi / Business); Jahresabo „10 zahlen, 12 nutzen"; Plus enthält Hobby-API | mittel (Werbung im Free-Tier; Abo verkauft explizit „werbe- und trackingfrei") | Entscheidungs-Features (Tour/Event), freier Zugang zu allem, Trefferquoten-Rückblick, moderne UX | Modellvergleichs-**Kultur** als Produkt: Ensembles und Modell-Dissens sichtbar statt versteckt; klare Nomenklatur der Läufe | Q1–Q4 |
| **WetterOnline** | DE, ≈20 Mio. monatl. Nutzer DE / ≈40 Mio. weltweit, >250 Mio. Downloads (Eigenangaben) | Reichweite, RegenRadar-Marke, App-Ökosystem, Werbevermarktung | Werbefinanziert + Abo | **hoch** — LDI NRW hat **Bußgeldverfahren** eröffnet: präzise Standortdaten ohne wirksame Einwilligung an >800 Werbepartner | Trackerfreiheit als **belegbares** Gegenmodell; kein Standortabfluss (nur 1 Geolocation-Aufruf im Code) | RegenRadar als Marke: ein Feature so gut benennen, dass es als eigenständiges Produkt gesucht wird | Q5, Q6 |
| **wetter.com** | DE, 26,88 Mio. Unique User (08/2022, Eigenangabe) | Reichweite, Routenwetter, Redaktion, interne Verifikations-Pipeline | Werbefinanziert; **Eigentümerwechsel: ProSiebenSat.1 → FUNKE Mediengruppe (12/2025, Closing Q1 2026, ~100 Mitarbeitende)** | hoch (Werbeportal) | Eigentümerwechsel = strategische Unruhe; buscosun kann Ehrlichkeit + Tempo dagegensetzen | Sie **messen** Prognosequalität, **zeigen** sie aber nicht — genau diese Lücke ist buscosuns Chance | Q9, Q37, Q38 |
| **wetter.de / RTL** | DE, Reichweite | Portalreichweite via TV-Marke | Werbefinanziert | hoch (n. v. im Detail) | — | — | (aus Q5-Umfeld, nicht vertieft) |
| **DWD WarnWetter** | DE, amtlich | Amtliche Warnungen bis Gemeindeebene, Push mit konfigurierbaren Schwellen, **prognostizierte Zugbahnen von Gewitterzellen**, Küsten-/Binnenseewarnungen, Naturgefahren (Hochwasser, Sturmflut, Lawine) | Amtlich; Gratisumfang gesetzlich begrenzt (BGH 12.03.2020) → Vollversion per **einmaligem** In-App-Kauf | niedrig | buscosun kann amtliche Warnungen kontextualisieren (Karte, Tour, Event) statt nur listen | Warn-UX: Schwellenwerte, Warnstufen, Gemeindeebene, **Zellzugbahnen** — und: einmaliger Kauf statt Abo ist ein faires Muster | Q10 |
| **NINA (BBK)** | DE, amtlich, Bevölkerungsschutz | Behördenwarnungen inkl. DWD, höchste Vertrauensstellung | Steuerfinanziert, werbefrei | niedrig | Nicht konkurrierbar — **komplementär** behandeln und verlinken | Ehrliche Rollenteilung: buscosun ist nie das Warnsystem, sondern der Kontext dazu | Q11 |
| **MeteoSwiss-App** | CH, 4,8 Mio. Geräte — die beliebteste Gratis-Wetter-App der Schweiz | Amtliche CH-Qualität, Push-Naturgefahrenwarnungen mit eigenen Schwellen, MTG-Satellit, neue Windanimation, Trockenheits-/Hochwasserwarnregionen | Amtlich, kostenlos | niedrig | buscosun ergänzt CH um Vertikalstruktur/Föhn/Entscheidungs-Features — aber **nicht** um Warnhoheit | **MeteoSchweiz hat seine Daten seit 05/2025 als OGD geöffnet** (ICON-CH1/CH2-EPS, Lokalprognosen ~6.000 Punkte, seit 01/2026 auch Radar) → CH-Parität ist heute technisch billig | Q12–Q14 |
| **GeoSphere Austria** | AT, amtlich (ZAMG + GBA fusioniert 2023) | Amtliche AT-Warnungen, INCA, Gesundheitswetter (Pollen/UV/Luftschadstoffe) | Amtlich, kostenlos | niedrig | dito CH | **Warnungen liegen als CC-BY-4.0-Datensatz mit öffentlicher API im Data Hub** — kein Key, keine Registrierung. Größter Quick Win für V-13 | Q15, Q16 |
| **ORF Wetter / wetter.at** | AT, Reichweite via ORF-Marke | Pollen- und Umweltdaten-Portal, Redaktion | öffentlich-rechtlich bzw. werbefinanziert | n. v. | — | Gesundheitsdaten (Pollen/UV/Ozon) sind in AT prominent platziert — Nachfrage ist belegt | Q16-Umfeld |
| **SRF Meteo** | CH, Reichweite via SRG | Redaktionelle Wetterlage 3×/Tag, Vertrauen, UV-Index-Karte | öffentlich-rechtlich | niedrig | — | Redaktioneller Text als Vertrauensanker — buscosun hat **keinen** Erzähl-Layer | Q-Suche „SRF Meteo", Q-UV-Suche |
| **bergfex** | AT/CH/DE + 7 weitere Länder, Berg-/Ski-Ökosystem | **9.500+ Webcams**, Schneehöhen, Pistenpläne, Touren-Community, Tracking | Freemium: PRO (Schneeprognose-Karten 6-h, 7-Tage-Schneeanalyse, Webcam-Archiv, werbefrei) + Tourismus-B2B | mittel | Alpine **Vertikal**-Tiefe (Föhn, Inversion, Tal/Grat) — das hat bergfex nicht | Ökosystem-Denken: Wetter allein bindet nicht, Webcams + Schneehöhen + Community binden. **Nicht kopieren — bewusst meiden** (s. §8) | Q19 |
| **Windy.com** | global, Visualisierungs-Benchmark | Modell-Picker (ECMWF/GFS/ICON/NEMS/AROME/UKV/ICON-EU/**ICON-D2**), 50+ Layer, Aviation-Layer (Icing, CAT, Cloud Base), Distance-&-Planning-Routenplaner | Freemium: Premium ≈25,99 €/Jahr (Abo) bzw. 38,99 € einmalig 12 Monate; Wasser-/Luft-Routen nur Premium | niedrig–mittel (n. v.) | DACH-Auflösung (Landes-Radare, INCA, rzc), Entscheidungs-Features, Trefferquote, kein Paywall | **Modell-Picker-UX** ist der Goldstandard: sichtbar, ein Klick, Modellname im Chrome. buscosuns Switcher ist hinter einem Overlay versteckt | Q20, Q21 |
| **Ventusky** (InMeteo, CZ) | global, Animations-Benchmark | Schönste Animation, viele Layer, laut Anbieter **werbe- und trackerfrei** in der Basis | Freemium (Premium-Layer: Wolken, Wind in 16 Höhen, Gewitter, Schneedecke, Nullgradgrenze, Sicht) | **niedrig** — direkter Konkurrent um die Trackerfrei-Positionierung | buscosun ist bei DACH-Nowcast/Radar und Entscheidungen tiefer | Animationsqualität; und: dass „trackerfrei" auch mit Premium-Layern vereinbar ist | Q24 |
| **meteoblue** | global, B2B-stark, CH-Wurzeln (Uni Basel) | 40+ Modelle + eigene KI, **dichte Meteogramme**, Sounding/Stüve, Astronomie-Seeing, Klimaarchiv | Freemium point+ (1/3/6/12 Monate, 14 Tage Test) + **B2B-APIs** (Weather API, Image API), Kunden in Agrar/Solar/Wind | niedrig–mittel | buscosun hat mehr Entscheidungslogik und ist frei | **Meteogramm-Dichte**: eine Grafik, die eine Entscheidung trägt. Und: der einzige belegte Beweis, dass B2B-API im DACH-Wettermarkt trägt | Q22, Q23 |
| **Pflotsh (SuperHD / ECMWF / Storm)** | DACH-Nische, Profi/Enthusiast | „Central Europe Super HD" 1×1 km für DE/AT/CH; **drei Modelle gleichzeitig** pro Ort | Reines Abo (ohne Abo nur Rumpf-Daten) | niedrig | Freier Zugang; buscosun braucht kein Abo, um Modelle zu vergleichen | „Drei Modelle nebeneinander" als **Standard-Ansicht**, nicht als Expertenfunktion | Q31 |
| **Foreca** | global/EU | Solide Vorhersage + Radar, aktiv gepflegt, sehr günstig (≈2,99 €/Jahr) | Freemium/Billig-Abo + B2B-Datengeschäft | n. v. | — | Preisanker: Endkunden-Wetter-Abos liegen im **einstelligen Euro-Bereich pro Jahr** — Zahlungsbereitschaft ist minimal | Q34-Umfeld |
| **WeatherPro / RainToday (MeteoGroup → DTN)** | DE-Erbe, schrumpfend | RainToday war die Referenz für „regnet es gleich" mit HD-Radar | Ehemals Kauf-App; nach DTN-Übernahme **faktisch abgekündigt** | n. v. | **Vakuum:** eine geliebte deutsche Ein-Zweck-Regen-App verwaist — genau buscosuns D-14-Wette | Ein-Zweck-Exzellenz gewinnt Herzen; Konzernübernahme tötet sie. Unabhängigkeit ist ein Verkaufsargument | Q33, Q34 |
| **Zoom Earth** | global | Radar-Nowcast bis 60 min, schöne Satellitenoptik, sehr schnell | Werbung/Freemium (n. v.) | n. v. | buscosun-Nowcast ist DE/AT/CH-nativ (RADOLAN/INCA/rzc) statt generisch | Ladegeschwindigkeit und „sofort da"-Gefühl ohne Onboarding | Q32 |
| **Weather Underground** | global | Community-Stationsnetz | Werbefinanziert | **hoch** — im Test die meisten Tracker (26) | Kontrastfolie für die Datenschutz-Positionierung | Community-Stationen als Datenquelle (buscosun nutzt nur amtliche Netze) | Q8 |
| **Yr (NRK + MET Norway)** | NO, global nutzbar, 12 Mio. Downloads | Öffentlich-rechtliche Klarheit, 90-min-Nowcast, Pollen/UV/Luftqualität, radikale Reduktion | Steuer-/Gebührenfinanziert, kostenlos, werbefrei | niedrig | Kein direkter DACH-Wettbewerb | **Das wichtigste UX-Vorbild:** Public-Service-Ton, Minimalismus, kein Feature-Geschrei. buscosuns nächster Verwandter im Geist | Q25 |
| **Windfinder / Windguru** | global, Windsport | 160.000 Spots, 21.000 Echtzeit-Messstationen, Spot-Kultur, Alarme | Freemium (Plus/Pro; Superforecast + Alarme kostenpflichtig) | n. v. | Nicht angreifen — Spot-Datenbank ist ein 20-Jahre-Graben | **Alarme sind das Premium-Feature Nr. 1** in Wind-Communities → Beleg für Zahlungsbereitschaft bei Alerting | Q30 |
| **burnair / XCTherm / Meteo-Parapente / Skysight** | Alpen, Gleitschirm | Thermik-Prognose, Basis-/Steigwerte, Höhenwind, XC-Potenzial; XCTherm liefert ICON-D2 gratis | Abo (burnair, Skysight) bzw. gratis (XCTherm) | niedrig | buscosun hat den besseren **Laien**-Zugang zur Vertikalstruktur | **Ehrliche Einordnung: hier führt buscosun nicht.** Ohne Thermik-/Basis-Prognose ist buscosun für Piloten Zweitwerkzeug | Q29 |
| **avalanche.report / EAWS / SLF / LAWIS / White Risk** | Alpen, amtlich | Amtlicher Lawinenlagebericht, EAWS-standardisiert | Amtlich/Verbände, kostenlos | niedrig | Nicht angreifen | Rollenteilung sauber kommunizieren — buscosun verlinkt bereits statt zu modellieren (`src/avalanche.ts:1-8`), das ist genau richtig | Q28 |
| **SkyDemon / Windy Aviation** | EU, Luftfahrt | VFR-Planung, dekodierte METAR/TAF/GAFOR, Lufträume | Abo (SkyDemon) / Premium (Windy) | niedrig | Nicht angreifen — regulatorisch und haftungsseitig tabu | Bestätigt: Luftfahrt-Briefing ist ein Nicht-Ziel (§8) | Q35 |
| **komoot / Epic Ride Weather / WattWeather / wetter.com Routenwetter** | DE/EU, Tourenplanung | Wetter entlang der Route zur Fahrzeit; komoot: „Tour-Wetter" **nur in Premium** | Abo (komoot Premium, Epic Ride Weather) bzw. werbefinanziert (wetter.com) | mittel | buscosun bietet Routenwetter **gratis** und mit Höhenkorrektur + E-Bike-Akku | **Wichtige Korrektur:** „Wetter zur Ankunftszeit" ist **kein** Alleinstellungsmerkmal mehr. Der Vorsprung liegt in Höhenphysik + E-Bike-Akku, nicht im Grundprinzip | Q36, Q37, Q41 |
| **Google (WeatherNext 2 / DeepMind)** | global, Plattformmacht | KI-Vorhersage in Google Suche, Gemini, Pixel Weather, Maps Weather API; hunderte Szenarien in <1 min | Plattform + Cloud-API | hoch (Google-Ökosystem) | **Strukturelle Bedrohung** der Mainstream-Schicht („Wie wird das Wetter?" beantwortet Google direkt) → buscosun muss auf Fragen zielen, die Google nicht beantwortet (Tour, Event, Vertikale, Vertrauen) | KI-Modelle sind Mainstream geworden. Wer sie **benennt und einordnet**, hat einen Ehrlichkeitsvorsprung | Q26 |
| **ECMWF AIFS** | global, amtlich/offen | Erstes voll operatives ML-Vorhersagesystem, Open Data, ENS operativ seit 07/2025 | Öffentlich, Open Data | niedrig | buscosun **ingestiert AIFS bereits** (`src/fusion/modelCatalog.ts:254,261`) — Chance, nicht Bedrohung | KI-Modelle sind Open Data → Differenzierung entsteht durch **Einordnung**, nicht durch Zugang | Q27 |
| **Climate Reanalyzer / Show-Your-Stripes** | global, Bildung | Freie Klimavisualisierung, akademische Glaubwürdigkeit | Universitär/gemeinnützig | niedrig | buscosuns Historie ist ortsbezogen (ERA5-Drilldown) statt global | Gemeinnütziger Träger als Finanzierungsmodell (§7 Option F) | Q40 |

---

## 3. Wo buscosun führt — belegt

Vorgehen: für jede der vier Achsen aus `roadmap.md` §C (a) prüfen, ob das Feature im Code real ist,
(b) den nächstliegenden Wettbewerber benennen, (c) ehrlich urteilen.

### 3.1 Achse 1 — Entscheidungs- statt Datenprodukt → **Teilführung, schmaler als angenommen**

| Behauptetes Unique | Code-Beleg | Existiert? | Wer kommt am nächsten? | Urteil |
|---|---|---|---|---|
| Wetter entlang der Route **zur echten Ankunftszeit** | `src/route/TourView.tsx:211`, `src/route/RouteScrubber.tsx:179-182` | ja | **komoot Premium „Tour-Wetter"** (Q36), wetter.com Routenwetter (Q37), Epic Ride Weather / WattWeather (Q41), Windy Distance & Planning (Q20) | **kein Alleinstellungsmerkmal.** Vorteil nur: gratis + Höhenkorrektur |
| **E-Bike-Akku-Reichweite** entlang der Tour | `src/route/ebikeBattery.ts:1-28` (Steady-State-Leistungsmodell P_grav/P_roll/P_aero → Motor-Wh → SoC; Eco/Tour/Sport/Turbo; „eine Stufe runter"-Empfehlung), eingebunden `TourView.tsx:25-26,211` | ja, vollwertig | Reichweiten-Rechner existieren im **E-Bike-Ökosystem** (Herstellersoftware), aber **kein Wetter-/Tourenwetter-Anbieter** koppelt Akku-SoC mit Steigung und Wetter entlang der Route — in der Recherche kein Treffer | **Echtes Alleinstellungsmerkmal** in der Wetter-Kategorie. Einschränkung: Vollständigkeit der Marktabdeckung nicht beweisbar (Negativbeweis) |
| **Event-Phasen** (Trauung/Empfang/Abendfeier einzeln bewertet) | `src/event/eventModel.ts:89-133` (`weddingPhases()`), Bewertung `src/event/eventScoring.ts:619-636` (`evaluatePhase`) | ja | Kein DACH-Wettbewerber mit phasenweiser Bewertung gefunden; „bester Tag"-Scores sind verbreitet, Phasen nicht | **Alleinstellung** |
| **Plan B** (Ausweichtag + Ausweichort + Entscheidungs-Deadline) | `src/event/eventScoring.ts:699-816` (Schwellenwertverletzung → Venue-Empfehlung + Deadline), `src/event/eventAltLocation.ts:92` (`findBetterLocation`) | ja | keiner gefunden | **Alleinstellung** — und der stärkste einzelne Entscheidungs-Beleg im Produkt |
| Foto-Licht (Goldene/Blaue Stunde, Nebel-/Abendrot-Chance) | `src/photo/photoLight.ts:1-11`, gerendert `src/event/EventResult.tsx:1224-1332` | ja, **aber nur im Event-Flow** bei `activity.id === 'photo'` | PhotoPills, Sun Surveyor (Foto-Nische, Abo) | Inhaltlich stark, **produktseitig versteckt** → V-PRD-11-Umfeld |
| Astro-Nacht (Mondphase, astron. Dunkelheit, Lichtverschmutzung, Tau) | `src/astro/astroNight.ts:1-8`, `src/astro/lightPollution.ts`, gerendert `EventResult.tsx:316,1360-1389` | ja, **nur** bei `activity.id === 'stargazing'` | meteoblue „Astronomy Seeing" (nur point+, Q22), Clear Outside | Inhaltlich konkurrenzfähig, **versteckt** |

**Verdikt Achse 1:** buscosun führt — aber **nicht** über Routenwetter, sondern über **Event-Phasen + Plan B**
und den **E-Bike-Akku**. Die §C-These „Tour zur Ankunftszeit … teils Alleinstellung" ist **zu optimistisch**
und muss korrigiert werden. Zusätzlich sind zwei der stärksten Entscheidungs-Features (Foto, Astro)
nur über einen Event-Wizard erreichbar — sie zahlen kaum auf die Positionierung ein.

### 3.2 Achse 2 — Alpin-/Vertikal-Tiefe → **Führung bei Laien, keine Führung bei Spezialisten**

| Feature | Code-Beleg | Existiert? | Nächster Wettbewerber | Urteil |
|---|---|---|---|---|
| Vertikalschnitt entlang gezogener Linie, Linsen Höhenwind/Inversion/Go-No-Go/Föhn/Thermik | `src/atmosphere/AtmosphereDeck.tsx:40` (Linsen), `:430` (`evaluateGoNoGo` aus `src/threed/goNoGo.ts`), `:330-382` (Inversion); erreichbar via `#3d=`/`#atm=` (`src/App.tsx:82,124`) | ja, vollwertig | Windy (Wind in Höhenleveln, Sounding, Airgram), meteoblue (Sounding/Stüve, point+), Pflotsh (Q31) — **ob einer davon einen frei gezogenen Schnitt hat: nicht verifiziert** | **Wahrscheinlich führend in der frei zugänglichen Laien-Schicht.** Nicht beweisbar führend gegenüber Profi-Tools |
| **Föhn-Detektor** | `src/pointForecast/foehnDetector.ts:1-156` (Lee-Sektor × Windstärke × Böigkeit × niedrige RH × Geo-Faktor, Schwelle 0,6), genutzt `weatherEnrichment.ts:38`, UI `RouteScrubber.tsx:179-182`, `atmosphere/FoehnPanel.tsx:12` | ja — **im Code selbst als „heuristisch/Tier-C" gekennzeichnet** | Kein Wettbewerber mit benanntem Föhn-Feature für Endnutzer gefunden (GeoSphere/MeteoSwiss behandeln Föhn redaktionell) | **Alleinstellung als Produkt-Feature**, aber physikalisch bescheiden. Die Selbstkennzeichnung ist vorbildlich (D-04) |
| Alpine Tal/Grat-Trennung + Schneefallgrenze | `src/nowcast/alpineSplit.ts:5-19`, UI `src/nowcast/NowcastDetail.tsx:127-133`; Schneelinie `src/scalar/snowLine.ts:1-14` (Marching Squares auf `terrainTemp − T50`, Physik-Anker + ML-Korrektur) | ja | bergfex (Schneefallgrenze redaktionell), Kachelmann/Pflotsh (1 km-Modell löst Täler auf) | **Führend in der Darstellung**, gleichauf in der Physik |
| Höhenkorrigierte Temperatur (Lapse Rate + DEM) | `src/pointForecast/terrainPhysics.ts:145`-Umfeld, Refinement in Scalar-Layern | ja | Kachelmann/Pflotsh „Super HD" 1×1 km (Q3, Q31) lösen Gelände **nativ** auf statt nachzukorrigieren | **buscosun führt hier nicht** — eine Nachkorrektur schlägt kein 1-km-Modell |
| Thermik-/XC-Prognose | — | **fehlt** | burnair, XCTherm, Skysight, Meteo-Parapente (Q29) | **Klarer Rückstand** in der Luftsport-Nische |

**Verdikt Achse 2:** Führung **nur** in der Kombination „alpine Vertikalstruktur für Laien, frei zugänglich".
Gegen Spezialisten (Gleitschirm) und gegen 1-km-Modelle (Kachelmann Super HD, Pflotsh) führt buscosun nicht.
Die §C-Formulierung „Alpin-Tiefe ist buscosuns Vorsprung" ist **zu breit** und zu präzisieren.

### 3.3 Achse 3 — Radikale Ehrlichkeit → **stärkste Achse, klarer und verteidigbarer Vorsprung**

| Feature | Code-Beleg | Existiert? | Nächster Wettbewerber | Urteil |
|---|---|---|---|---|
| **Trefferquoten-Rückblick (Hit-Rate)** | `src/confidence/hitRate.ts:58-104` — holt die Open-Meteo **previous-runs-API**, 30 zurückliegende Tage, Lead 1 d + 3 d, Temperatur/Niederschlag/Wind, **pro Modell**; gerendert `src/confidence/ForecastDeck.tsx:297,511` | ja, live | **wetter.com misst Prognosequalität intern, zeigt sie den Nutzern aber nicht** (Q38). Kachelmann zeigt Modelldissens + Ensembles (Q4), aber keinen retrospektiven Trefferquoten-Score | **Deutlichster Vorsprung im gesamten Produkt.** In der Recherche kein DACH-Anbieter gefunden, der Endnutzern zeigt, wie gut die eigene Vorhersage der letzten 30 Tage war |
| Unsicherheitsband / Spread | `src/confidence/ForecastDeck.tsx:291,481` (`UncertaintyChart` mit Geisterlinien früherer Läufe), Caption `:292` „Linie = Konsens · Band = Spread der Modelle"; Basis `distributionModel.ts`, `ensemble.ts` | ja | Kachelmann Ensembles (Q4), meteoblue Multimodell (Q23), Windy Ensemble-Ansicht | **Gleichauf** — Ensembles sind Standard bei Enthusiasten-Anbietern; buscosun erklärt sie besser |
| Länder-Asymmetrien offen ausgewiesen | `src/SearchPage.tsx:658` („UV, Pollen & amtliche Warnungen — Nur Deutschland (DWD). AT/CH bekommen das nicht."), `:661` („Kein Backend … keine Accounts/Sync"), `:662` („Kein METAR/TAF, Lawinen- oder Seegangsbericht"); Coverage-Gate `src/pointForecast/warningsCrossCheck.ts:16-17,39-45` | ja, im Produkt sichtbar | **Kein Wettbewerber gefunden**, der seine eigenen Lücken im Produkt benennt | **Alleinstellung** — und ein ungenutztes Marketing-Asset |
| Radar-only 0–2 h statt gestreckter Modellhälfte (D-14) | `precipSource.ts`-Pfad, Slider ≤ 3 h (AT INCA) | ja | RainToday/Zoom Earth: 60 min Nowcast (Q32, Q33) | **Gleichauf, aber ehrlicher begründet** |
| Konservative Experten-Sprache | `src/sources/iconD2Rotation.ts:7-8,148-154` (uh_max ⊕ uh_max_low × sdi_2) mit explizitem „kein Warnprodukt"-Text | ja | Kachelmann Storm-Tools (kostenpflichtig, Profi-Sprache) | **Vorbildlich**, kein Wettbewerbsvergleich nötig |

**Verdikt Achse 3:** Führend, verteidigbar und **strategisch unterbewertet**. Die Trefferquote ist heute in
einer Unterseite (`ForecastDeck`) vergraben, obwohl sie das einzige Merkmal ist, das buscosun in einem
Satz erklärt.

### 3.4 Achse 4 — Trackerfrei / ohne Account / schnell → **führend gegen die kommerziellen Portale, aber aktuell nicht glaubwürdig belegt**

| Aussage | Code-Beleg | Urteil |
|---|---|---|
| Keine Werbung, keine Bezahl-Schranke, keine Zahlungsanbieter | Kein `stripe`/`paypal`/`paddle`/`adsbygoogle`/`googletag` in `src/`; `package.json` hat nur 6 Runtime-Deps | **bestätigt** |
| Keine Accounts, kein Server-Sync | Keine Auth-Bibliothek, keine Auth-Logik; Personalisierung ausschließlich über `buscosun.*`-localStorage-Keys (`src/favorites.ts:11`, `src/notifications/notificationStore.ts:32-34`, `src/history/historyState.ts:131-132` u. a.) | **bestätigt** |
| Minimaler Standortzugriff | **Genau ein** Geolocation-Aufruf im gesamten Produkt: `src/nowcast/NowcastPage.tsx:86-92` | **bestätigt** — scharfer Kontrast zu WetterOnline (Q6: präzise Standortdaten an >800 Werbepartner) |
| Nächster Wettbewerber | Ventusky (werbe-/trackerfreie Basis, Q24), Yr (öffentlich-rechtlich, Q25), die amtlichen Apps DWD/NINA/MeteoSwiss/GeoSphere | **Gleichauf**, nicht führend |
| **Aber:** kein Impressum, keine Datenschutzerklärung | Keine Seite, keine Route, kein Link; Footer `src/SearchPage.tsx:692-729` enthält nur Quellen/Werkzeuge/Feedback; `scripts/generate-seo.mjs` erzeugt keine Rechtsseiten (Grep `Impressum\|Datenschutz\|privacy\|legal` in `scripts/` → **kein Treffer**) | **Kritischer Widerspruch:** Das Produkt behauptet Datenschutz als Prinzip und erfüllt zugleich die formale Mindestpflicht nicht (§5 DDG, Art. 13 DSGVO) — bei aktivem Geolocation-Zugriff |
| Keine Security-Header | `roadmap.md` A7 / `improvements.md` V-07 | verstärkt denselben Widerspruch |

**Verdikt Achse 4:** Inhaltlich führend gegenüber WetterOnline/wetter.com/Weather Underground
(Q6–Q8) — aber **die Positionierung ist heute nicht belegbar**, weil die Seite kein
Datenschutz-Dokument hat. Das ist die **billigste große Verbesserung im ganzen Katalog**.

### 3.5 Weitere verifizierte Stärken, die in §C fehlen

| Feature | Code-Beleg | Wettbewerbs-Einordnung |
|---|---|---|
| **Blitz-Prognose-Layer** aus ICON-D2 `lpi_max` (t+1…12 h) | `src/sources/iconD2Lpi.ts:112-144`; Layer `lightningfc` `src/MapView.tsx:297,339,1661-1667` — **explizit getrennt** vom beobachteten Sferics-Layer | Wettbewerber zeigen fast durchweg **beobachtete** Blitze (Kachelmann, WetterOnline, Windy). Ein deklarierter Blitz-**Prognose**-Layer für Endnutzer wurde nicht gefunden → **wahrscheinlich Alleinstellung im DACH-Endkundenmarkt** (nicht abschließend verifiziert) |
| **Rotations-/Superzellen-Layer** | `src/sources/iconD2Rotation.ts:7-8,148-154`, `MapView.tsx:993-1054,337` | Vergleichbares gibt es bei Kachelmann nur im **kostenpflichtigen** Storm-Tool (Q1/Q2) → buscosun bietet Profi-Signal gratis, mit konservativer Sprache |
| **Gewitterpotenzial** (cape_ml × cin_ml × lpi) | `src/sources/iconD2Thunder.ts:6,130-151`, `MapView.tsx:297,433,1033` | CAPE-Karten sind bei Windy/Kachelmann Standard; die **Fusion zu einem Index** ist buscosun-eigen |
| **Schnee-Layer** (Decke `h_snow` / Neuschnee `snow_gsp`) | `src/sources/iconD2Snow.ts:5-6,37,160-186`, `MapView.tsx:297,265,1033` | Modellierte Schneedecke ≠ bergfex-Messwerte — komplementär, kein Ersatz |
| **KI-Modelle bereits ingestiert** | `src/fusion/modelCatalog.ts:227` (AICON, DWD, `ai: true`), `:254` (AIFS Single, ECMWF), `:261` (AIFS ENS); Typunion `:36` kennt auch `aigfs`, `aigefs`, `graphcast` | **Strategisch bedeutsam:** buscosun ist auf der KI-Modell-Welle (Q26, Q27) bereits vorne — aber die Modelle sind **in Produktion teils tot** (Defekt A1: `/_ecmwf`-Proxy fehlt in `netlify.toml`) und werden nirgends als KI ausgewiesen |
| **Globus rendert LIVE-GFS** | `src/globe/gfs.ts:18-19` (NOAA `noaa-gfs-bdp-pds` S3 über `/_gfs`), `:50` Lauf-Listing, `:90` `.idx`, `:119` Byte-Range-GRIB2; `GlobeMap.tsx:124,101`; `windPngUrl: ''` (`:158`) umgeht das gebündelte Sample bewusst | **Die Doku-Fiktion „Sample-Daten" ist falsch** (s. §13). Der Globus ist ein echtes Live-Produkt — nur nicht im Command-Deck-Design |

---

## 4. Wo buscosun zurückliegt — belegte Table-Stakes-Lücken

Sortiert nach Marktrelevanz. Alle Lücken sind **am Code verifiziert**, nicht aus der Alt-Doku übernommen.

| # | Lücke | Code-Beleg | Wer hat es? | Schwere |
|---|---|---|---|---|
| **L1** | **Echtes Push-Alerting fehlt vollständig.** `NULL_BACKEND` ist der einzige je verdrahtete Backend; `collectPushChannel()` wirft unbedingt; der Service Worker behandelt **nur** `install`/`activate`/`fetch` — Grep nach `push` in `sw.js`: **0 Treffer**. Zusätzlich ist der `NotificationProvider` **nur im Event-Werkzeug** montiert (`src/event/EventPage.tsx:48`) | `src/notifications/notificationBackend.ts:74,96-110`; `src/notifications/useNotifications.tsx:79,313-315`; `public/sw.js:22,29,48`; `src/main.tsx:14-18` | **Alle** relevanten Wettbewerber: DWD WarnWetter (konfigurierbare Schwellen, Q10), NINA (Q11), MeteoSwiss (Naturgefahren-Push mit Schwellen, Q12), Windfinder (Alarme als Premium-Feature Nr. 1, Q30), Windy, bergfex | **Kritisch** — die größte einzelne Table-Stakes-Lücke. Betrifft Pendler, Gärtner, Winterdienst, Eventplaner |
| **L2** | **AT/CH-Parität bei Warnungen, UV, Pollen.** Warnungen: nur DE, und nicht einmal direktes CAP, sondern über BrightSky; AT/CH bekommen einen No-op-Checker. UV: nur DE amtlich, sonst berechneter Klarhimmel-Wert. Pollen: DE amtlich, AT/CH nur Open-Meteo/CAMS **hinter einem Opt-in** | `src/sources/dwdAlerts.ts:1-5,75`; `src/pointForecast/warningsCrossCheck.ts:16-17,39-45`; `src/sources/dwdUvForecast.ts:20-21`, Gate `src/pointForecast/pointForecast.ts:209-210`, Fallback `weatherEnrichment.ts:207`; `src/sources/dwdPollen.ts:2-13,18`, Gate `PointForecastPanel.tsx:148`, Opt-in-Fallback `src/sources/openMeteoPollen.ts:9,13` + `PointForecastPanel.tsx:161` | GeoSphere (AT) und MeteoSwiss (CH) liefern all das amtlich — **und die Daten sind heute offen**: GeoSphere-Warnungen als CC-BY-4.0-API ohne Registrierung (Q15), MeteoSchweiz-OGD seit 05/2025 inkl. Radar seit 01/2026 (Q13, Q14), Pollen-API AT/CH über polleninformation.at (Q17) und MeteoSchweiz-Messnetz (Q18) | **Kritisch** — widerspricht dem Namen „DACH-Referenz". **Neue Erkenntnis: der Aufwand ist 2026 erheblich niedriger als 2026-06 angenommen** |
| **L3** | **Kein Impressum, keine Datenschutzerklärung, keine Erklärung zur Barrierefreiheit** | Kein Treffer in `src/` und `scripts/`; Footer `src/SearchPage.tsx:692-729` ohne Rechtslinks; Geolocation aktiv (`src/nowcast/NowcastPage.tsx:86-92`) | Jeder Wettbewerber. Zusätzlich verlangt das **BFSG seit 28.06.2025** für B2C-Websites/Apps WCAG-2.1-AA nach EN 301 549 **plus eine Erklärung zur Barrierefreiheit** (Q39) | **Kritisch (rechtlich)** — auch wenn die Kleinstunternehmer-Ausnahme des BFSG greifen könnte (nicht verifiziert), gilt die Impressums-/DSGVO-Pflicht unabhängig davon |
| **L4** | **Keine native App, keine Widgets, keine Store-Präsenz.** Kein Capacitor/Cordova/React Native/Tauri, kein `ios/`/`android/`. PWA ist installierbar (Manifest + SW + Icons), aber das Manifest hat **weder `shortcuts` noch `share_target`** (17 Zeilen, nur Icons) | Grep über das Repo → kein Treffer; `public/manifest.webmanifest:4-15`; `index.html:16,21-25` | Alle. Wetter ist die **Widget-Kategorie** schlechthin | **Hoch** — schließt buscosun von der Store-Entdeckung und vom Homescreen-Wetterblick aus |
| **L5** | **Keine Webcams, keine Schneehöhen-Messwerte, kein Lift-/Pistenstatus** | Null Webcam-Integration in `src/` (einziger `bergfex`-Treffer: `src/route/routeFormats.ts:25`, ein GPX-Quellen-Label). Kein Lift-/Pisten-/Skigebiets-Datensatz (`lift`-Treffer sind `liftedIndex` in `src/threed/soundingMath.ts`) | bergfex: 9.500+ Webcams + Schneehöhen + Pistenpläne (Q19); Skiline, Snow-Forecast | **Mittel — bewusst NICHT zu schließen** (§8): das ist bergfex' 20-Jahre-Graben |
| **L6** | **Favoriten können nicht angelegt werden.** `addFavorite`/`toggleFavorite` haben **keinen Aufrufer**; `SearchPage.tsx:35` importiert nur `getFavorites`/`removeFavorite` → `buscosun.favorites.v1` bleibt dauerhaft leer. Parallel existiert ein **funktionierendes** zweites System in der Historie | `src/favorites.ts:29,34,48`; `src/SearchPage.tsx:35,391`; `src/history/historyState.ts:140-141`, `HistoryPage.tsx:272` | Jeder Wettbewerber hat Favoritenorte; DWD WarnWetter nennt sie explizit als Kernfunktion (Q10) | **Hoch** — bestätigt `roadmap.md` A4 / V-04. Ohne Favoriten gibt es keine Wiederkehr-Mechanik |
| **L7** | **Keine Mehrsprachigkeit.** Keine i18n-Bibliothek, keine Locale-Dateien, alle UI-Strings hart deutsch; `index.html:2` `lang="de"`, `manifest.webmanifest:5` `"lang": "de"`; SEO nur `de` mit hreflang de-DE/de-AT/de-CH | `scripts/generate-seo.mjs:57-60` | Windy, Ventusky, meteoblue, Yr sind mehrsprachig | **Mittel** — in DACH tolerierbar (O-05), aber CH (FR/IT) und Tourismus sind ausgeschlossen |
| **L8** | **Kein Embed/Export außer Historie; keine öffentliche API** | Embed nur für die Historie: `src/history/historyExport.ts:60-62` (`embedSnippet()` → `<iframe … #embed=1>`), UI `src/history/HistoryPro.tsx:227`, Render-Pfad `HistoryPage.tsx:143,175-190`. Keine Embeds für Karte/Nowcast/Vorhersage/Route/Event; die zwei Netlify-Edge-Functions sind CORS-Proxys, kein Produkt-API | meteoblue (Weather API, Image API — Q22/Q23), Kachelmann (Hobby-API im Plus-Abo — Q1), Foreca | **Mittel** — blockiert Reichweite (Einbettungen in Blogs/Tourismusseiten) und die einzige realistische B2B-Option |
| **L9** | **Kein METAR/TAF, kein Lawinenlagebericht als Daten, kein Seegang, keine Luftqualität, kein PV-Ertrag** | METAR/TAF: nur der Ehrlichkeitshinweis `src/SearchPage.tsx:662`. Lawine: `src/avalanche.ts:1-8,20-31` = **reines Deep-Link-Mapping** (SLF/lawinen.report/LWD Bayern/EAWS), kein Fetch, kein Gefahrenlevel. Luftqualität: Open-Meteo-Air-Quality-Endpunkt wird genutzt, aber **nur Pollen-Variablen** abgefragt (`src/sources/openMeteoPollen.ts:13,20-27`) — kein PM/NO2/O3/AQI. PV: Grep `ASWDIR\|ASWDIFD\|SOBS_RAD\|GLOBAL_RAD\|ghi\|dni` über das Repo → **kein Treffer** | SkyDemon (Q35), avalanche.report/SLF (Q28), meteoblue (Solar-/Agrarkunden, Q23) | **Niedrig bis mittel** — L9 ist überwiegend **richtig so** (§8 Nicht-Ziele). Ausnahmen: Luftqualität wäre fast gratis (Endpunkt ist schon angebunden), PV wäre neu |
| **L10** | **Keine Agrar-Features im Betrieb.** Historische Indizes existieren (GDD, frostfreie Periode, HDD) — aber keine Bodenfeuchte (kein `W_SO`/`TERRA`), kein Spritzfenster, keine Evapotranspiration. Zudem bewirbt `manifest.webmanifest:4` ein „Arbeitsfenster", das es im Code **nicht gibt** (Grep in `src/` → kein Treffer) | `src/history/historyIndices.ts:17,31,82`; `src/history/HistoryPro.tsx:36,162`; `public/manifest.webmanifest:4` | meteoblue (Agrar-Kernmarkt, Q23) | **Niedrig — Nicht-Ziel.** Aber das Manifest-Versprechen ist ein Ehrlichkeits-Defekt (D-04) |

---

## 5. Best Practices zum Übernehmen

Je Muster: Quelle · was genau übertragbar ist · D-27-Verträglichkeit (Command-Deck) · D-04-Verträglichkeit (Ehrlichkeit) · Aufwand.

| # | Muster | Quelle | Was übertragbar ist | D-27 | D-04 | Aufwand |
|---|---|---|---|---|---|---|
| **B1** | **Sichtbarer Modell-Picker im Chrome** | Windy (Q21), Pflotsh „3 Modelle nebeneinander" (Q31) | Windy zeigt Modellname und -wahl **permanent** in der Oberfläche, ein Klick entfernt. buscosuns Switcher ist funktionsfähig (`src/fusion/modelSource.ts:113,205-220`, UI `src/MapView.tsx:3088,3434-3437`), aber hinter dem `ModelLibraryOverlay` versteckt — die Modellwahl ist damit unsichtbar | ✅ Rail-/Topbar-Chip im Command-Deck | ✅ **stärkt** D-04: welches Modell gerade spricht, wird sichtbar | **M** |
| **B2** | **Modellvergleichs-Kultur als Produkt** | Kachelmann Wetterkanal (Q4), Ensemble-Seite (Q1/Q3) | Kachelmann erklärt *warum* man Modelle vergleicht („bei großer Streuung ist die Unsicherheit deutlich größer") und macht das zum Markenkern. buscosun hat die Daten (`ForecastDeck.tsx:291,481`), aber keine Erzählung | ✅ Deck-Ansicht | ✅ Kern von D-04 | **M** |
| **B3** | **Meteogramm-Dichte: eine Grafik trägt eine Entscheidung** | meteoblue (Q22, Q23) | Ein einziges dichtes Diagramm (Temperatur + Niederschlag + Wind + Bewölkung + Unsicherheit) statt mehrerer Kacheln. buscosun hat `UncertaintyChart` und `SectionChart`, aber keine verdichtete Tages-/Wochen-Grafik | ✅ als eigenes Deck-Panel | ✅ solange das Spread-Band mitkommt | **M** |
| **B4** | **Warn-UX: Schwellen, Stufen, Ebenen** | DWD WarnWetter (Q10), MeteoSwiss (Q12) | Nutzer wählen **Warnelemente, Warnstufen und Schwellenwerte** selbst; Warnungen sind auf Gemeindeebene verortet; MeteoSwiss lässt Warnungen teilen. buscosuns Alert-Logik existiert bereits lokal (`src/nowcast/nowcastAlerts.ts:224`, `src/notifications/notificationStore.ts:32-34`) — es fehlt nur der Transport (L1) | ✅ Dock-Panel | ✅ mit Coverage-Hinweis je Land | **M** (UI) + **L** (Transport, O-01) |
| **B5** | **Zellzugbahnen** | DWD WarnWetter: „prognostizierte Zugbahnen von Gewitterzellen" (Q10) | buscosun hat Optical-Flow-Nowcast (D-17) und einen Rotations-Layer — daraus lassen sich Zell-Zugbahnen ableiten, ohne neue Datenquelle. Steht bereits als Chance in `roadmap.md` §B7 | ✅ Karten-Overlay | ⚠️ **nur** mit konservativer Sprache (D-19, F5-Muster) — nie als Warnprodukt | **L** |
| **B6** | **Public-Service-Ton & Minimalismus** | Yr (Q25) | Yr ist der nächste Geistesverwandte: kostenlos, werbefrei, ruhig, keine Feature-Prahlerei, klare Sprache. buscosun hat 12 Verticals und keinen ruhigen Einstieg | ✅ **genau die Command-Deck-These** (D-27: eine App statt zwölf Inseln) | ✅ | **M** (Redaktion/IA), keine neue Technik |
| **B7** | **Ein-Zweck-Marke** | WetterOnline „RegenRadar" (Q5), RainToday (Q33) | Ein Feature so benennen und bewerben, dass es einzeln gesucht wird. buscosuns radar-only-Nowcast (D-14) ist genau dafür gebaut, hat aber keinen Namen und keinen Deep-Link (`roadmap.md` A5: `#r=` wird nie geprüft) | ✅ | ✅ | **S** (Benennung + Deep-Link, hängt an V-05) |
| **B8** | **Einmalkauf statt Abo** | DWD WarnWetter: Vollversion per **einmaligem** In-App-Kauf (Q10) | Falls je monetarisiert wird (§7): der amtliche Dienst zeigt, dass ein Einmalkauf im deutschen Markt akzeptiert ist — fairer als ein Abo | ⚪ | ⚠️ berührt D-01/D-03 | — (Entscheidung, keine Umsetzung) |
| **B9** | **Alarme sind das meistverkaufte Premium-Feature** | Windfinder (Q30), Windy (unbegrenzte Alerts in Premium, Q20), Kachelmann Storm-Tool (Q1) | Beleg dafür, dass Alerting die höchste Zahlungsbereitschaft trägt — relevant für die O-01-Abwägung | ⚪ | ⚪ | — (Faktenlage für §7) |
| **B10** | **Ökosystem statt Einzelfeature** | bergfex (Q19) | bergfex bindet über Webcams + Schneehöhen + Community, nicht über Prognosequalität. **Lehre = Warnung:** buscosun kann dieses Spiel nicht gewinnen und sollte es nicht spielen | ⚪ | ⚪ | — (strategische Lehre) |
| **B11** | **Animationsqualität als Marke** | Ventusky (Q24) | Ventusky beweist: Trackerfreiheit und erstklassige Animation schließen sich nicht aus. buscosuns Wind-Partikel-Layer ist auf diesem Niveau, wird aber nicht als Markenzeichen inszeniert | ✅ | ✅ | **S** (Inszenierung, kein neuer Code) |
| **B12** | **KI-Modelle benennen** | WeatherNext 2 in Google Suche/Gemini/Pixel (Q26); AIFS operativ + Open Data (Q27) | Der Markt füllt sich mit KI-Vorhersagen, ohne sie zu kennzeichnen. buscosun hat bereits ein `ai: true`-Flag im Katalog (`src/fusion/modelCatalog.ts:227,254,261`) — daraus lässt sich ein Transparenz-Merkmal machen | ✅ Chip/Badge im Deck | ✅ **idealtypisches D-04-Feature** | **M** |

---

## 6. Weiße Flecken & Innovationspotenzial im DACH-Markt

Sortiert nach „wie leer ist der Fleck" × „wie gut passt buscosun".

### 6.1 Nutzersichtbare Verifikation — **der leerste Fleck**

- **Befund:** wetter.com misst Prognosequalität und schreibt darüber (Q38), zeigt sie aber nicht in der App.
  Der DWD verifiziert wissenschaftlich, adressiert damit aber Fachpublikum. Kein Endkundenprodukt im
  DACH-Raum zeigt „so gut lagen wir die letzten 30 Tage".
- **buscosun:** hat es fertig gebaut (`src/confidence/hitRate.ts:58-104`) und versteckt es.
- **Chance:** Die Trefferquote von einem Unterpanel zur **Marken-Startseite** machen. Das ist kein
  Feature-Bau, sondern eine Platzierungsentscheidung.

### 6.2 Entscheidungs- statt Datenprodukt — **halbleer**

- **Befund:** komoot/wetter.com/Windy liefern Routenwetter (Q36, Q37, Q20), aber niemand liefert
  Phasen + Plan B + Entscheidungs-Deadline.
- **Einschränkung:** Der Fleck ist kleiner als in §C angenommen, weil Routenwetter längst Standard ist.
- **Chance:** Die **Plan-B-Mechanik** (`src/event/eventScoring.ts:699-816`) auf andere Verticals
  übertragen — „Plan B" für Touren, für Fotoausflüge, für den Grillabend.

### 6.3 Barrierefreiheit — **vollständig unbesetzt, jetzt auch rechtlich relevant**

- **Befund:** In der gesamten Recherche kein DACH-Wetteranbieter, der Barrierefreiheit als Merkmal führt.
  Gleichzeitig gilt seit **28.06.2025** das BFSG: WCAG 2.1 AA nach EN 301 549 **plus** eine Erklärung zur
  Barrierefreiheit für B2C-Websites und -Apps (Q39). Kleinstunternehmen sind ausgenommen — ob das für
  buscosun greift, ist **nicht verifiziert** und eine Frage an Jan.
- **buscosun:** extrem ungleich (`roadmap.md` §B4 / V-12: Historie 75 aria-Attribute vs. Globus 5).
- **Chance:** Wetter ist Grundversorgung. „Die zugänglichste Wetterseite im DACH-Raum" ist ein
  ehrliches, verteidigbares und rechtlich rückenstärkendes Alleinstellungsmerkmal — und es passt exakt
  zur Ehrlichkeitsmarke. **Der beste Fleck, den niemand sonst besetzt.**

### 6.4 Trackerfrei als aktive Positionierung — **halbbesetzt**

- **Befund:** Ventusky (Q24) und die amtlichen Apps besetzen den Platz bereits. Gleichzeitig hat der
  Marktführer WetterOnline ein laufendes **Bußgeldverfahren** wegen Standortdaten an >800 Werbepartner
  (Q6, 2026-04-07), Stiftung Warentest stufte 6 von 8 Wetter-Apps datenschutzkritisch ein (Q7).
- **Chance:** Der Markt liefert die Gegenerzählung frei Haus. buscosun muss sie nur **belegen**
  — und braucht dafür zuerst eine Datenschutzerklärung (L3).

### 6.5 Alpine Vertikalstruktur für Laien — **schmal besetzt**

- **Befund:** Vertikaldaten gibt es reichlich (Windy, meteoblue, Pflotsh, burnair/XCTherm) — aber
  durchweg in Profi-Darstellung (Soundings, Emagramme) oder hinter Abos.
- **Chance:** buscosun ist die einzige gefundene Anwendung, die Inversion und Föhn **erklärend** und
  gratis an Laien richtet (`src/atmosphere/AtmosphereDeck.tsx:40,330-382`, `FoehnPanel.tsx:12`).
  Zielgruppe sind nicht Piloten, sondern **Wetterfühlige, Wanderer, Talbewohner im Nebel**.

### 6.6 KI-Modell-Transparenz — **komplett unbesetzt**

- **Befund:** WeatherNext 2 speist Google Suche, Gemini, Pixel Weather und Google Maps (Q26); AIFS ist
  seit 25.02.2025 operativ und Open Data (Q27). **Kein Anbieter kennzeichnet gegenüber Endnutzern,
  ob eine Vorhersage aus einem physikalischen oder einem KI-Modell stammt** — und schon gar nicht,
  wo die beiden auseinanderlaufen.
- **buscosun:** hat AICON, AIFS Single und AIFS ENS bereits mit `ai: true` im Katalog
  (`src/fusion/modelCatalog.ts:227,254,261`) — die Metadaten für ein Transparenzmerkmal liegen schon da.
- **Chance:** „Physik vs. KI — wo sind sie sich einig?" ist ein Feature, das nur ein
  Ehrlichkeitsprodukt bauen kann, und es passt punktgenau zum Zeitgeist.

### 6.7 Energie/PV und Landwirtschaft — **besetzt, nicht empfohlen**

- meteoblue ist genau dafür gegründet worden (Q23) und hat 20 Jahre Vorsprung. `src/history/historyIndices.ts:17,31,82`
  zeigt, dass buscosun agrarische Klimaindizes kann — aber Betriebsentscheidungen brauchen SLA und Support.
  → **Nicht-Ziel** (§8).

---

## 7. Monetarisierung — Optionen (OFFENE FRAGE für Jan, keine Empfehlung)

> `roadmap.md` §E hält fest, dass **kein Monetarisierungsmodell dokumentiert** ist. Dieser Abschnitt
> liefert die Marktfakten und die realistischen Optionen — die Entscheidung liegt bei Jan.

### 7.1 Wie der DACH-Markt monetarisiert (belegt)

| Modell | Wer | Beleg |
|---|---|---|
| Werbung + Datenweitergabe | WetterOnline, wetter.com, wetter.de, Weather Underground | Q5–Q9; Bußgeldverfahren Q6; Tracker-Befunde Q7/Q8 |
| Freemium-Abo („werbefrei" als Produkt) | Kachelmann (4 Stufen), bergfex PRO, Windy Premium (≈25,99 €/Jahr), Ventusky Premium, Windfinder Plus/Pro, meteoblue point+ | Q1, Q2, Q19, Q20, Q22, Q24, Q30 |
| Reines Abo | Pflotsh, burnair, Skysight, SkyDemon | Q29, Q31, Q35 |
| Billig-Abo als Volumengeschäft | Foreca ≈2,99 €/Jahr | Q34-Umfeld |
| **Einmalkauf** | DWD WarnWetter-Vollversion | Q10 |
| B2B/API | meteoblue (Weather API, Image API), Kachelmann (Hobby-API im Plus, Business-Lizenz), Foreca, Google Maps Weather API | Q1, Q22, Q23, Q26 |
| Steuer-/Gebührenfinanziert | DWD, NINA, MeteoSwiss, GeoSphere, SRF Meteo, Yr | Q10–Q16, Q25 |
| Universitär/gemeinnützig | Climate Reanalyzer | Q40 |

### 7.2 Der strukturelle Befund, den Jan kennen muss

**Das meistverkaufte Wetter-Produkt in DACH ist „werbefrei" — und buscosun ist bereits werbefrei.**
Kachelmann, bergfex, Windy und Ventusky verkaufen ihren Nutzern primär die Abwesenheit von Werbung
(Q1, Q2, Q19, Q20, Q24). buscosun hat diesen Hebel **verschenkt**, weil es nie Werbung eingeführt hat.
Verkaufbar bleiben deshalb nur *Funktionen* — Alarme, Archive, Exporte, höhere Auflösung —, und genau
die stehen bei buscosun heute allen frei zur Verfügung. Jede Bezahlversion müsste also **Bestehendes
wegnehmen oder aufteilen** und kollidiert damit direkt mit der Obersten Direktive „Funktionserhalt".

Zweiter Befund: Die Zahlungsbereitschaft ist niedrig. Foreca liegt bei ≈2,99 €/Jahr, Windy bei
≈25,99 €/Jahr für ein globales Profi-Produkt (Q20, Q34-Umfeld).

### 7.3 Optionen

| Option | Was es bedeutet | Berührt welche Entscheidungen | Aufwand | Risiko |
|---|---|---|---|---|
| **A · Status quo (nichts)** | buscosun bleibt Liebhaberprojekt; Kosten = Netlify + Zeit | keine | — | Bus-Faktor 1 bleibt; kein Puffer, falls Netlify-Bandbreite bei Multi-MB-GRIBs kippt (`roadmap.md` §B11) |
| **B · Spenden / „Kaffee"** | Ko-fi / GitHub Sponsors / Steady-Link im Footer, keine Gegenleistung | **keine** — kein Account, kein Tracking, kein Backend, kein Funktionsentzug | **S** | Deckt erfahrungsgemäß nur Betriebskosten; keine Verpflichtung entsteht |
| **C · Optionaler bezahlter Tier** | Zusatzfunktionen (Archive, unbegrenzte Alarme, Exporte) gegen Geld | **D-01** (Entitlement-Prüfung braucht Server), **D-03** (Identität nötig), **D-02** (Zahlungsanbieter = Drittanbieter-Daten), **Funktionserhalt** (nichts Bestehendes darf hinter die Schranke) | **L** | Höchstes Risiko: greift drei Grundsatzentscheidungen zugleich an. **Explizit als D-01/D-03-Konflikt zu markieren** |
| **D · Einmalkauf statt Abo** | Variante von C nach dem WarnWetter-Muster (Q10) | wie C, aber ohne wiederkehrende Abrechnung | **L** | wie C; fairer wahrgenommen |
| **E · B2B / API / Embeds** | Historie-Embed existiert bereits (`src/history/historyExport.ts:60-62`); Ausbau zu Embeds für Tourismusregionen, Vereine, Blogs; später API | **O-01**; Embeds selbst brauchen **kein** Backend (statisch!) | **M** (Embeds) / **L** (API) | Embeds sind der **risikoärmste Einstieg**: kein Account, kein Tracking, keine Funktionsentnahme — und sie erzeugen zugleich Reichweite und Backlinks |
| **F · Förderung / Sponsoring** | Prototype Fund, NGI-Zero-artige Programme, Stiftungen, Alpenvereine, Tourismusverbände, Hochschulkooperation (Vorbild Climate Reanalyzer, Q40) | keine | **M** (Antragsarbeit) | Projektförderung ist endlich; Antragsaufwand real. Passt aber exzellent zur Trackerfrei-/Ehrlichkeits-/Barrierefreiheits-Positionierung |
| **G · White-Label für Regionen** | Command-Deck-Ansicht für eine Tourismusregion/Bergbahn, gebrandet | **O-01** (Kunden erwarten SLA), D-05 | **L** | Verpflichtet zu Support und Verfügbarkeit — bei Bus-Faktor 1 gefährlich |

### 7.4 Wie die Optionen zusammenspielen (kein Vorschlag, nur Struktur)

- **B + F** sind mit **allen** aktiven Entscheidungen (D-01, D-02, D-03, D-04) vereinbar und erfordern
  keine Produktänderung.
- **E (Embeds)** ist die einzige Option, die Reichweite *und* Erlöspotenzial erzeugt, ohne ein Backend
  zu erzwingen.
- **C/D/G** setzen zwingend die O-01-Entscheidung voraus und sind ohne sie nicht bewertbar.

**→ Offene Frage an Jan in §12.**

---

## 8. Zielgruppen-Priorisierung

Basis: `docs/zielgruppen-dach.md` Teil B (13 Segmentgruppen, Stand 2026-06-09 — mit den in §13
korrigierten Fehlern) plus die Marktbefunde aus §2–§6.

### 8.1 Die vier Segmente, die buscosun besitzen sollte

**Z1 · Alpine Tourenplaner (Wandern, Rennrad/Gravel/MTB, E-Bike, Motorrad, Bikepacking)**
- *Warum:* Achse 1 (E-Bike-Akku `src/route/ebikeBattery.ts:1-28` = belegte Alleinstellung) × Achse 2
  (Höhenkorrektur, Föhn, Tal/Grat).
- *Wettbewerbslage:* komoot besitzt die Routen, nicht das Wetter — und versteckt Tour-Wetter hinter
  Premium (Q36). bergfex besitzt die Berge, nicht die Physik (Q19).
- *Weißer Fleck:* kostenloses, physikalisch ernsthaftes Tourenwetter mit Akku-Reichweite.
- *Voraussetzung:* Favoriten (L6) und Deep-Links (`roadmap.md` A5) müssen funktionieren.

**Z2 · Termin-/Licht-/Astro-Planer (Hochzeiten, Freiluft-Events, Landschaftsfotografie, Astronomie)**
- *Warum:* Achse 1 in Reinform. Event-Phasen (`src/event/eventModel.ts:89-133`) + Plan B
  (`eventScoring.ts:699-816`, `eventAltLocation.ts:92`) + Foto-Licht (`src/photo/photoLight.ts:1-11`)
  + Astro-Nacht (`src/astro/astroNight.ts:1-8`) sind **zusammen bei keinem Wettbewerber** zu finden.
- *Wettbewerbslage:* meteoblue hat Astronomie-Seeing (kostenpflichtig, Q22); Foto-Apps (PhotoPills)
  haben Licht, aber kein Wetter-Ensemble; niemand hat Phasen + Plan B.
- *Weißer Fleck:* groß. **Das am stärksten unterbewertete Segment im ganzen Produkt.**
- *Hebel:* Foto und Astro aus dem Event-Wizard heraus sichtbar machen (heute nur via `activity.id`).

**Z3 · Das Ehrlichkeits-Publikum (Wetter-Skeptiker, Hobby-Meteorologen, Lehrende, Klima-Interessierte)**
- *Warum:* Achse 3 — Trefferquote (`src/confidence/hitRate.ts:58-104`), Spread, offen ausgewiesene
  Lücken (`src/SearchPage.tsx:658-662`), Experten-Layer mit konservativer Sprache
  (`src/sources/iconD2Rotation.ts:7-8`), ERA5-Historie.
- *Wettbewerbslage:* Kachelmann bedient dieses Publikum — **gegen Bezahlung und mit Werbung** (Q1, Q2).
  wetter.com misst Qualität, zeigt sie aber nicht (Q38).
- *Weißer Fleck:* nutzersichtbare Verifikation (§6.1) — der leerste Fleck im ganzen Markt.
- *Bonus:* Dieses Publikum trägt Mundpropaganda und ist die natürliche Zielgruppe für die
  KI-Transparenz (§6.6).

**Z4 · Alpenrand-Alltag: Föhn-Geplagte, Wetterfühlige, alpine Pendler und Talbewohner**
- *Warum:* Achse 2 + Achse 4. Föhn-Detektor (`src/pointForecast/foehnDetector.ts:1-156`),
  Inversion (`AtmosphereDeck.tsx:330-382`), radar-only-Nowcast (D-14).
- *Wettbewerbslage:* Kein Wettbewerber mit benanntem Föhn-Feature; die amtlichen AT/CH-Dienste
  behandeln Föhn redaktionell.
- *Voraussetzung — und zugleich die härteste:* **Pendler brauchen Push (L1), und AT/CH-Nutzer
  brauchen Parität (L2).** Ohne beides bleibt Z4 auf DE-Talbewohner beschränkt.

### 8.2 Segmente, die buscosun explizit NICHT verfolgen sollte

| Nicht-Ziel | Warum nicht | Beleg |
|---|---|---|
| **Luftfahrt-Briefing** (Privatpiloten, Ballon) | METAR/TAF fehlen (`src/SearchPage.tsx:662`); SkyDemon besitzt den europäischen VFR-Markt (Q35); Haftung und Regulierung | L9, Q35 |
| **Lawinen-/Bergrettungs-Profis** | `src/avalanche.ts:1-8` sagt selbst „buscosun modelliert KEINE Lawinengefahr"; EAWS/SLF/avalanche.report sind amtlich (Q28). **Die Deep-Link-Lösung ist die richtige** | L9, Q28 |
| **Ski-/Schneehöhen-Ökosystem** | bergfex hat 9.500+ Webcams, Pistenpläne, Community (Q19). Ein Nachbau ist Datensammel-Arbeit, kein Wetterprodukt | L5, Q19 |
| **Windsport-Spots** (Kite/Surf/Segeln) | Windfinder/Windguru haben 160.000 Spots und 21.000 Messstationen (Q30); zusätzlich fehlt jedes Seegangsmodell | L9, Q30 |
| **Gleitschirm-Profis** | burnair/XCTherm/Skysight liefern Thermik, Basis und XC-Potenzial (Q29) — buscosun hat keine Thermikprognose. **Als Zweitwerkzeug für Höhenwind/Inversion bleibt buscosun relevant, als Primärwerkzeug nicht** | §3.2, Q29 |
| **Landwirtschaft & PV als Betriebsentscheidung** | meteoblue ist genau dafür gegründet (Q23); Betriebsentscheidungen brauchen SLA. Keine Strahlungsvariablen im Code (L9) | L9, L10, Q23 |
| **B2B/Behörden mit SLA** (Kran, Bau, Winterdienst, Feuerwehr, Tourismusbüros) | Kein Account, kein Export, keine Verfügbarkeitszusage; Bus-Faktor 1. Erst nach O-01 überhaupt diskutierbar | L8, `decisions.md` O-01 |
| **Globale Reisende** | D-05 (DACH-Fokus) ist bewusst gesetzt; Windy/Ventusky/Foreca besitzen global | D-05 |
| **Mainstream „Wie wird das Wetter heute?"** | Diese Frage beantwortet inzwischen Google direkt aus WeatherNext 2 in Suche, Gemini, Pixel und Maps (Q26). **Gegen Plattform-Distribution ist kein Wettkampf zu gewinnen** — buscosun muss auf Fragen zielen, die Google nicht beantwortet | Q26 |

---

## 9. Neufassung `roadmap.md` §C (fertig zum Einsetzen)

> Der folgende Block ersetzt §C vollständig. Er ist so formatiert, dass der Koordinator ihn direkt
> übernehmen kann.

```markdown
## §C Wettbewerb DACH — verifiziert (Web-Recherche 2026-07-31, Belege in `audit/strategie-2026-07-31/produkt-wettbewerb.md`)

> Alle Reichweitenzahlen sind Eigenangaben der Anbieter; unabhängige Marktanteilsdaten waren nicht
> auffindbar. Preise sind Stand 07/2026 und vor Entscheidungen neu zu prüfen.

| Anbieter | Reichweite | Kern-Stärke | Geschäftsmodell | Werbe-/Tracking-Last | buscosuns Konter | Was zu lernen ist |
|---|---|---|---|---|---|---|
| Kachelmannwetter | DACH-Enthusiasten | Modellvielfalt, Ensembles, „Mitteleuropa Super HD" 1 km, Radar-/Blitzqualität | Werbung + 4 Abostufen (Werbefrei/Plus/Kombi/Business), Hobby-API im Plus | mittel | Alles gratis; Trefferquoten-Rückblick; Entscheidungs-Features | Modellvergleich als Marken-**Kultur**, nicht als Expertenfunktion |
| WetterOnline | ≈20 Mio./Monat DE (Eigenangabe) | Reichweite, Marke „RegenRadar" | Werbung + Abo | **hoch — laufendes Bußgeldverfahren der LDI NRW wegen Standortdaten an >800 Werbepartner (netzpolitik.org, 2026-04-07)** | Trackerfreiheit belegbar machen (genau 1 Geolocation-Aufruf im Code) | Ein Feature so benennen, dass es einzeln gesucht wird |
| wetter.com | 26,88 Mio. Unique User (08/2022) | Reichweite, Routenwetter, interne Verifikation | Werbung; **Eigentümerwechsel ProSiebenSat.1 → FUNKE (12/2025, Closing Q1/2026)** | hoch | Ehrlichkeit + Tempo gegen Portallogik | Sie **messen** Prognosequalität und **zeigen** sie nicht — genau das ist buscosuns Fleck |
| DWD WarnWetter + NINA | DE, amtlich | Amtliche Warnungen bis Gemeindeebene, Push mit Schwellen, Gewitterzell-Zugbahnen | amtlich; Vollversion per **Einmalkauf** (BGH 12.03.2020) | niedrig | Warnungen kontextualisieren statt duplizieren | Warn-UX (Stufen/Schwellen/Ebenen), Zellzugbahnen, Einmalkauf-Fairness |
| MeteoSwiss-App | CH, 4,8 Mio. Geräte | Amtliche CH-Qualität, Push-Naturgefahren, MTG-Satellit | amtlich, gratis | niedrig | Vertikaltiefe + Entscheidungen ergänzen, Warnhoheit nie beanspruchen | **MeteoSchweiz-OGD seit 05/2025 offen** (ICON-CH1/CH2-EPS, Lokalprognosen, Radar seit 01/2026) → CH-Parität ist billig geworden |
| GeoSphere Austria | AT, amtlich | Amtliche AT-Warnungen, INCA, Gesundheitswetter (Pollen/UV) | amtlich, gratis | niedrig | dito | **Warnungen als CC-BY-4.0-API im Data Hub, ohne Registrierung** → größter Quick Win für AT-Parität |
| bergfex | AT/CH/DE + 7 Länder | 9.500+ Webcams, Schneehöhen, Pistenpläne, Touren-Community | Freemium PRO + Tourismus-B2B | mittel | Alpine **Vertikal**-Tiefe (Föhn, Inversion, Tal/Grat) | Ökosystem bindet stärker als Prognosequalität — **bewusst nicht angreifen** |
| Windy | global | Modell-Picker (inkl. ICON-D2), 50+ Layer, Routenplanung | Freemium ≈25,99 €/Jahr | niedrig–mittel | DACH-Auflösung, Entscheidungs-Features, Trefferquote, kein Paywall | **Sichtbarer Modell-Picker im Chrome** ist der UX-Goldstandard |
| Ventusky | global | Beste Animation; laut Anbieter werbe- und trackerfrei | Freemium (Premium-Layer) | **niedrig — direkter Konkurrent um die Trackerfrei-Position** | DACH-Nowcast/Radar-Tiefe | Trackerfreiheit und Premium schließen sich nicht aus |
| meteoblue | global, B2B | 40+ Modelle + eigene KI, dichte Meteogramme, Sounding, Klimaarchiv | point+ Abo + **B2B-APIs** (Agrar/Solar/Wind) | niedrig–mittel | Mehr Entscheidungslogik, frei | Meteogramm-Dichte; einziger Beleg, dass B2B-API im DACH-Wettermarkt trägt |
| Pflotsh (SuperHD/ECMWF) | DACH-Nische | „Central Europe Super HD" 1 km; drei Modelle nebeneinander | reines Abo | niedrig | Modellvergleich ohne Abo | „Drei Modelle nebeneinander" als **Standardansicht** |
| Yr (NRK + MET Norway) | NO/global, 12 Mio. Downloads | Public-Service-Klarheit, 90-min-Nowcast, Minimalismus | gebührenfinanziert, werbefrei | niedrig | kein direkter Wettbewerb | **Das wichtigste UX-Vorbild** — Ton und Reduktion |
| WeatherPro/RainToday (DTN) | DE-Erbe, schrumpfend | War die Referenz für „regnet es gleich" | nach Konzernübernahme faktisch abgekündigt | n. v. | **Vakuum genau in buscosuns D-14-Wette** | Ein-Zweck-Exzellenz bindet; Unabhängigkeit ist ein Argument |
| Zoom Earth / RainViewer | global | 60-min-Radar-Nowcast, Tempo | Werbung/Freemium | n. v. | DE/AT/CH-nativer Radar-Komposit | „Sofort da" ohne Onboarding |
| Windfinder / Windguru | global, Windsport | 160.000 Spots, 21.000 Messstationen, Alarme | Freemium | n. v. | nicht angreifen | **Alarme sind das meistverkaufte Premium-Feature** |
| burnair / XCTherm / Skysight | Alpen, Gleitschirm | Thermik-, Basis-, XC-Prognose | Abo (XCTherm gratis) | niedrig | besserer Laien-Zugang zur Vertikalen | **Hier führt buscosun nicht** — ohne Thermikprognose nur Zweitwerkzeug |
| EAWS / avalanche.report / SLF | Alpen, amtlich | Amtlicher Lawinenlagebericht | amtlich | niedrig | nicht angreifen | buscosun verlinkt bereits, statt zu modellieren — genau richtig |
| SkyDemon / Windy Aviation | EU, Luftfahrt | VFR-Planung, dekodierte METAR/TAF/GAFOR | Abo | niedrig | nicht angreifen | bestätigt Luftfahrt als Nicht-Ziel |
| komoot / Epic Ride Weather / WattWeather | DE/EU, Touren | Wetter entlang der Route zur Fahrzeit (komoot: **nur Premium**) | Abo | mittel | gratis + Höhenphysik + E-Bike-Akku | **Routenwetter ist kein Alleinstellungsmerkmal mehr** |
| Google WeatherNext 2 / DeepMind | global, Plattform | KI-Vorhersage in Suche, Gemini, Pixel, Maps API | Plattform + Cloud | hoch | Fragen besetzen, die Google nicht beantwortet | KI ist Mainstream — wer sie **benennt**, hat den Ehrlichkeitsvorsprung |
| ECMWF AIFS | global, offen | Erstes voll operatives ML-System, Open Data | öffentlich | niedrig | buscosun ingestiert AIFS bereits | Zugang differenziert nicht mehr — **Einordnung** differenziert |

**Revidierte Differenzierungs-These (2026-07-31):**

1. **Ehrlichkeit als Produkt — die tragende Achse.** Nutzersichtbare Trefferquote
   (`src/confidence/hitRate.ts:58-104`), Spread-Band, offen ausgewiesene Länder-Lücken
   (`src/SearchPage.tsx:658-662`). *Kein DACH-Anbieter zeigt Endnutzern seine eigene Treffsicherheit*
   — wetter.com misst sie und zeigt sie nicht. Dies ist der breiteste und am besten verteidigbare Vorsprung.
2. **Entscheidungen, die niemand sonst trifft — enger gefasst.** Nicht „Routenwetter" (das haben komoot,
   wetter.com, Windy, Epic Ride Weather), sondern **Event-Phasen + Plan B + E-Bike-Akku**.
3. **Alpine Vertikalstruktur für Laien — präziser gefasst.** Nicht „Alpin-Tiefe" allgemein
   (Kachelmann/Pflotsh lösen Gelände mit 1-km-Modellen nativ besser auf, burnair/XCTherm sind bei
   Thermik voraus), sondern **Föhn, Inversion und Tal/Grat verständlich und gratis** — für Wetterfühlige,
   Wanderer und Talbewohner, nicht für Piloten.
4. **Respekt vor dem Nutzer: trackerfrei, ohne Account, ohne Paywall — und zugänglich.** Der Markt
   liefert die Gegenerzählung frei Haus (Bußgeldverfahren gegen WetterOnline, 6 von 8 Apps
   datenschutzkritisch). **Neu ergänzt: Barrierefreiheit.** Sie ist im DACH-Wettermarkt vollständig
   unbesetzt, seit 28.06.2025 rechtlich relevant (BFSG/EN 301 549 → WCAG 2.1 AA) und passt exakt zur
   Ehrlichkeitsmarke. *Einschränkung: Achse 4 ist heute **nicht belegbar**, solange Impressum und
   Datenschutzerklärung fehlen.*

**Neue Achse in Prüfung (5): KI-Modell-Transparenz.** buscosun ingestiert AICON, AIFS Single und AIFS ENS
bereits mit `ai: true`-Flag (`src/fusion/modelCatalog.ts:227,254,261`). Kein Anbieter kennzeichnet
gegenüber Endnutzern, ob eine Vorhersage aus Physik oder KI stammt. Entscheidung durch Jan, ob dies
zur fünften Achse erhoben wird.
```

---

## 10. Revision `roadmap.md` §D — Now / Next / Later

### 10.1 Vorgeschlagene Neufassung

```markdown
## §D Priorisierung (revidiert nach Wettbewerbsanalyse 2026-07-31)

**Now (Wochen) — Glaubwürdigkeit und Betrieb:**
- §A-Defekte A1–A7 (A1 zusätzlich dringend: der `/_ecmwf`-Proxy fehlt in Prod → **AIFS/IFS sind live tot**,
  obwohl KI-Modelle das Marktthema 2026 sind)
- **NEU: Impressum + Datenschutzerklärung + Erklärung zur Barrierefreiheit (V-PRD-01)** — Rechtspflicht
  und Voraussetzung dafür, dass die Trackerfrei-Positionierung überhaupt behauptet werden darf
- **NEU (hochgezogen): AT-Warnungen aus dem GeoSphere Data Hub (V-PRD-02)** — CC BY 4.0, offene API,
  keine Registrierung; der billigste Schritt zur DACH-Ehrlichkeit
- Favoriten reparieren (V-04) — ohne Favoriten keine Wiederkehr; Table-Stakes bei jedem Wettbewerber
- CI-Minimum (V-11) · Cron-Health-Monitoring (V-03) · Domain-Entscheidung O-03 (V-02)

**Next (1–2 Quartale) — Marktparität und Positionierung:**
- **Hochgezogen: O-01-Entscheidung Push** (aus „Later") — Push ist die größte Table-Stakes-Lücke
  (`notificationBackend.ts:74`); alle amtlichen Apps und alle Sport-Apps haben es, Alarme sind
  branchenweit das meistverkaufte Premium-Feature. **Die Entscheidung darf nicht länger warten.**
- CH-Parität über MeteoSchweiz-OGD (V-PRD-03) + Pollen AT/CH (V-PRD-04) → schließt V-13
- **Hochgezogen: A11y-Programm Stufe 1 (V-12)** — BFSG-Frist lief am 28.06.2025 ab; zugleich der
  einzige völlig unbesetzte Qualitäts-Fleck im DACH-Markt
- Trefferquote nach vorn holen (V-PRD-05) + Modell-Picker sichtbar machen (V-PRD-06) — die
  Ehrlichkeitsachse endlich sichtbar
- Navigations-/Router-Modell (V-05) — Voraussetzung für teilbare Deep-Links und die Ein-Zweck-Marke
- Design-System-Konsolidierung (V-10) · MapView-Zerlegungsplan (O-04/V-14) · Teststrategie O-02
- PWA-Ausbau: Shortcuts, Share-Target, Installations-Onboarding (V-PRD-08)

**Later (strategisch):**
- Fusion-v2-Cutover (V-15) — Genauigkeitsgewinn, aber **kein** Wettbewerbsargument, das Nutzer sehen;
  bewusst hinter der Sichtbarkeits-Arbeit
- KI-Transparenz-Layer (V-PRD-14) — abhängig davon, ob Jan Achse 5 bestätigt
- Embeds für weitere Verticals (V-PRD-09) — Reichweite und einzige risikoarme Erlösoption
- Zellzugbahnen / Radar-Katalog-Neupriorisierung · i18n O-05 · WebGPU · Observability O-06
- B2B/API — erst nach O-01
```

### 10.2 Begründung der Verschiebungen

| Verschiebung | Von → Nach | Begründung |
|---|---|---|
| Impressum/Datenschutz/A11y-Erklärung | (neu) → **Now** | Rechtspflicht (§5 DDG, Art. 13 DSGVO) bei aktivem Geolocation-Zugriff; ohne sie ist Achse 4 unbelegbar. Aufwand: Stunden |
| AT-Warnungen (Teil von V-13) | Next → **Now** | **Neue Faktenlage:** GeoSphere-Warnungen liegen als CC-BY-4.0-Datensatz mit offener API und ohne Registrierung vor (Q15). Die 2026-06 getroffene Einschätzung „L / Wochen" gilt für den AT-Warnteil nicht mehr |
| O-01-Entscheidung (Push) | Later → **Next** | Push ist die einzige Lücke, die **jeder** Wettbewerber geschlossen hat, inklusive aller amtlichen Apps (Q10, Q11, Q12). Zusätzlich: Alarme sind branchenweit das Premium-Feature Nr. 1 (Q30, Q20) → die Entscheidung ist zugleich die Monetarisierungs-Weiche |
| A11y-Programm | Next → **Next, aber priorisiert** | BFSG-Frist 28.06.2025 bereits verstrichen (Q39) **und** es ist der einzige völlig unbesetzte Differenzierungs-Fleck (§6.3) |
| Trefferquote sichtbar machen | (neu) → **Next** | Der stärkste Vorsprung des Produkts ist heute unsichtbar. Kein Datenprojekt, sondern eine Platzierungsentscheidung |
| Fusion-v2-Cutover | Next → **Later** | Verbessert Genauigkeit messbar, ist aber für Nutzer **unsichtbar**. Solange Achse 3 nicht sichtbar ist und AT/CH zweite Klasse sind, zahlt Fusion v2 nicht auf die Positionierung ein. (Kein Qualitätsurteil — nur Reihenfolge) |
| A1 (Prod-Proxy) | Now → **Now, verschärft** | Neuer Kontext: `/_ecmwf` fehlt in Prod, damit sind AIFS und AIFS ENS live tot — ausgerechnet in dem Jahr, in dem KI-Vorhersage zum Marktthema wurde (Q26, Q27) |

---

## 11. Vorgeschlagene V-Einträge

> Nummerierung `V-PRD-NN` (die laufende Nummerierung in `improvements.md` steht bei V-17;
> der Koordinator vergibt die endgültigen Nummern). **Keine Duplikate zu V-01…V-16.**

### Erweiterungen bestehender Einträge (nicht duplizieren!)

**V-13 (AT/CH-Parität) — Markt-Beleg ergänzen:**
Die Umsetzungsskizze kann konkretisiert werden: AT-Warnungen liegen als **CC-BY-4.0-Datensatz mit
öffentlicher API ohne Registrierung** im GeoSphere Data Hub (`https://data.hub.geosphere.at/dataset/warnungen-v1`,
Abruf 2026-07-31; Hochalpin ausgenommen). CH-Daten sind seit 22.05.2025 als OGD offen
(`https://opendatadocs.meteoswiss.ch/`, ICON-CH1/CH2-EPS, Lokalprognosen ~6.000 Punkte, Radar seit 01/2026).
Pollen AT/CH über `https://www.polleninformation.at/en/data-interface` (API-Key auf Anfrage,
Attributionspflicht, deckt AT/DE/CH). **Der Aufwand ist damit deutlich geringer als in der
2026-06-Einschätzung.** Details in V-PRD-02/03/04.

**V-16 (Push) — Markt-Beleg ergänzen:**
Push ist die einzige Table-Stakes-Funktion, die **ausnahmslos jeder** relevante Wettbewerber hat,
einschließlich aller amtlichen Apps: DWD WarnWetter (konfigurierbare Warnelemente, -stufen und
Schwellen), NINA, MeteoSwiss (Naturgefahren-Push mit eigenen Schwellen). Zusätzlich belegt der Markt
die Zahlungsbereitschaft: Alarme sind bei Windfinder und Windy das meistverkaufte Premium-Feature.
Code-Stand verschärft: `public/sw.js` behandelt nur `install`/`activate`/`fetch` — **kein `push`-Handler**
(0 Treffer); `NotificationProvider` ist zudem **nur** im Event-Werkzeug montiert
(`src/event/EventPage.tsx:48`), d. h. selbst In-App-Hinweise erreichen den Rest der App nicht.
**Empfehlung zur Priorität: O-01-Entscheidung von „Later" nach „Next".**

---

### V-PRD-01 · Impressum, Datenschutzerklärung & Erklärung zur Barrierefreiheit (Priorität P0 · Aufwand S · Status offen)
**Was:** Die App hat weder Impressum noch Datenschutzerklärung — keine Seite, keine Route, kein Link.
Der Footer (`src/SearchPage.tsx:692-729`) listet nur Quellen/Werkzeuge/Feedback; der SEO-Generator erzeugt
keine Rechtsseiten (Grep `Impressum|Datenschutz|privacy|legal` in `scripts/` → kein Treffer). Gleichzeitig
fordert die App aktiv den Standort an (`src/nowcast/NowcastPage.tsx:86-92`). Damit sind §5 DDG und
Art. 13 DSGVO nicht erfüllt. Zusätzlich verlangt das BFSG seit 28.06.2025 für B2C-Angebote eine
**Erklärung zur Barrierefreiheit** (`https://bfsg-gesetz.de/`, Abruf 2026-07-31) — ob die
Kleinstunternehmer-Ausnahme greift, ist ungeklärt (s. §12).
**Mehrwert:** Zwei Dinge auf einmal: Jan ist rechtlich abgesichert, und die wichtigste Marken-Aussage
wird endlich beweisbar. buscosun sagt „trackerfrei, ohne Account" — solange keine Datenschutzerklärung
existiert, ist das eine Behauptung. Genau in dem Moment, in dem der Marktführer WetterOnline wegen
Standortdaten ein Bußgeldverfahren am Hals hat, ist eine glaubwürdige Datenschutzseite das
schärfste Marketing-Instrument, das buscosun besitzt — und sie kostet einen halben Tag.
**Umsetzung:** Zwei statische Seiten über den bestehenden SEO-Generator (`scripts/generate-seo.mjs`,
neue Route `/rechtliches/…`) plus Footer-Links in der geteilten Deck-Shell (V-10) — Command-Deck-konform,
kein neues Designsystem. Inhalt der Datenschutzerklärung ist ungewöhnlich einfach und dadurch
werbewirksam: keine Cookies, keine Analytics, keine Accounts, alle Einstellungen in localStorage,
ein einziger Geolocation-Aufruf, Liste der aufgerufenen Drittserver (DWD, GeoSphere, MeteoSwiss,
NOAA, Open-Meteo/BrightSky, Nominatim, Netlify-Edge). Risiko: Rechtstext braucht Jans Freigabe;
kein Code-Risiko. Abhängigkeit: keine. Synergie mit V-07 (Security-Header) und V-12 (A11y).
**Quelle:** Produkt & Wettbewerb (Agent-Team), 2026-07-31.

### V-PRD-02 · AT-Warnungen aus dem GeoSphere Data Hub (Priorität P1 · Aufwand M · Status offen)
**Was:** Amtliche Warnungen sind DE-only und laufen über BrightSky statt direkt (`src/sources/dwdAlerts.ts:1-5,75`);
AT und CH bekommen einen No-op-Checker (`src/pointForecast/warningsCrossCheck.ts:16-17,39-45`).
Ein AT-Warn-Adapter existiert nicht (`src/sources/geosphere*.ts` sind AROME/INCA/TAWES).
**Neue Faktenlage:** GeoSphere stellt „Warnungen v1" als **CC-BY-4.0-Datensatz mit öffentlicher API,
ohne Registrierung** bereit (`https://data.hub.geosphere.at/dataset/warnungen-v1`, Abruf 2026-07-31);
Hochalpine Gebiete sind ausgenommen. Konkretisiert V-13.
**Mehrwert:** Österreichische Nutzer sehen endlich die amtlichen Warnungen ihres eigenen Landes — dort,
wo sie sie brauchen: auf der Karte, in der Tourenplanung, im Eventplaner. Heute steht für halb DACH an
derselben Stelle „gibt es bei uns nicht". Das ist der günstigste Schritt, mit dem der Name „DACH-Referenz"
zum ersten Mal für zwei von drei Ländern stimmt.
**Umsetzung:** Neuer Adapter `src/sources/geosphereAlerts.ts` nach dem Muster von `dwdAlerts.ts`;
`warningsCrossCheck.ts` bekommt einen AT-Zweig mit `coverage: 'partial'` (Hochalpin ehrlich ausweisen — D-04);
Konsumenten (`EventResult.tsx:1100`, `NowcastRadarMap.tsx:245`, `PointForecastPanel.tsx:137`) erben es
ohne Änderung. Attribution nach CC BY 4.0 in die Quellen-/Lizenzliste. Risiken: Rate-Limits und
Datenformat der API sind unbekannt (Kontrakt-Sonde nötig); ein Netlify-Rewrite kann für CORS nötig sein
→ **STOPP & FRAGEN**, weil das die Edge-/Transport-Zone berührt. Abhängigkeit: keine harte;
sinnvoll nach V-PRD-01 (Attributions-/Lizenzseite).
**Quelle:** Produkt & Wettbewerb (Agent-Team), 2026-07-31.

### V-PRD-03 · CH-Parität über die MeteoSchweiz-Open-Data (Priorität P1 · Aufwand M · Status offen)
**Was:** Für die Schweiz fehlen amtliche Warnungen (`warningsCrossCheck.ts:39-45`), amtlicher UV
(`src/pointForecast/pointForecast.ts:209-210` → berechneter Klarhimmel-Wert aus `uvClearSky.ts`) und
amtliche Pollen (`src/sources/dwdPollen.ts:11-12` sagt selbst „MeteoSwiss subscription-only").
**Diese Begründung ist überholt:** MeteoSchweiz stellt seine Daten seit 22.05.2025 als OGD frei zur
Verfügung — maschinenlesbar, per API, kostenlos; seit 01/2026 auch Lokalprognosedaten (~6.000 Punkte)
und Radardaten (`https://opendatadocs.meteoswiss.ch/`, `https://www.meteoschweiz.admin.ch/ueber-uns/meteoschweiz-blog/de/2026/01/open-government-data-lokalprognosedaten-und-radardaten-verfuegbar.html`,
Abruf 2026-07-31). Konkretisiert V-13.
**Mehrwert:** Schweizer Nutzer bekommen dieselbe Qualität wie deutsche — amtliche Warnungen, amtlichen
UV-Index, amtliche Lokalprognosen. Nebeneffekt: die Schweizer Lokalprognosen sind eine unabhängige
Vergleichsquelle, die die Trefferquoten-Auswertung für CH überhaupt erst aussagekräftig macht.
**Umsetzung:** Zuerst eine **Quellen-Sondierung** (welche OGD-Produkte decken Warnungen/UV/Pollen ab;
Lizenz- und Attributionslage prüfen), dann Adapter in `src/sources/` nach dem T2-Muster; Coverage-Anzeige
je Land in der UI (D-04). Berührt evtl. die bestehende `/_cscs`-Proxy-Lücke (Defekt A1 / V-01) →
Reihenfolge: V-01 zuerst. Risiken: Umfang der OGD-Warnprodukte ist **nicht verifiziert** — die
Sondierung kann ergeben, dass Warnungen (noch) nicht enthalten sind; dann bleibt der UV-/Prognoseteil.
**Quelle:** Produkt & Wettbewerb (Agent-Team), 2026-07-31.

### V-PRD-04 · Pollen für AT und CH aus amtsnahen Quellen (Priorität P1 · Aufwand M · Status offen)
**Was:** Pollen sind DE-amtlich (`src/sources/dwdPollen.ts:2-13`, Gate `PointForecastPanel.tsx:148`);
AT/CH bekommen nur eine Open-Meteo/CAMS-Näherung, und die auch nur **hinter einem Opt-in**
(`src/sources/openMeteoPollen.ts:9,13`, Gate `PointForecastPanel.tsx:161`, Flag `src/optIn.ts:9`).
Für Allergiker in AT/CH ist das Produkt damit praktisch leer. Verfügbar wären: der Österreichische
Pollenwarndienst mit dokumentierter API (persönlicher Key auf Anfrage, Attributionspflicht, deckt
AT/DE/CH — `https://www.polleninformation.at/en/data-interface`) und für CH das MeteoSchweiz-Pollenmessnetz
(14 Stationen, stündliche Auflösung — `https://www.pollenundallergie.ch/polleninformationen/pollendaten/infos-pollenmessungen`),
beide abgerufen 2026-07-31. Konkretisiert V-13.
**Mehrwert:** Millionen Allergiker in Österreich und der Schweiz bekommen eine echte Belastungsvorhersage
statt einer Modell-Näherung, die sie erst freischalten müssen. Pollen ist einer der wenigen Gründe,
aus denen Menschen eine Wetter-App **täglich** öffnen — das ist ein Bindungs-Feature, kein Nice-to-have.
**Umsetzung:** Neuer Adapter `src/sources/atPollen.ts` (+ ggf. `chPollen.ts`) nach dem Muster von
`dwdPollen.ts`; `PointForecastPanel.tsx:148,161` bekommt eine Länder-Weiche statt einer DE-Sperre;
Attribution zwingend (Lizenzbedingung). **Offene Frage an Jan:** Der AT-API-Key ist personengebunden
und müsste im Client liegen — das kollidiert mit D-01/D-06 (keine Secrets im Frontend) und würde
entweder eine Edge-Function (STOPP & FRAGEN-Zone) oder eine Ausnahme erfordern. Risiko: Lizenz erlaubt
möglicherweise keine Weiterverbreitung in einer öffentlichen App — **vor der Umsetzung schriftlich klären**.
**Quelle:** Produkt & Wettbewerb (Agent-Team), 2026-07-31.

### V-PRD-05 · Trefferquote zum Markenkern machen (Priorität P1 · Aufwand M · Status offen)
**Was:** Der Hit-Rate-Rückblick (`src/confidence/hitRate.ts:58-104` — 30 zurückliegende Tage, Lead 1 d
und 3 d, pro Modell) ist die einzige Funktion, bei der in der gesamten Wettbewerbsrecherche **kein
DACH-Anbieter** gefunden wurde, der Vergleichbares zeigt. wetter.com misst Prognosequalität sogar,
zeigt sie aber nicht in der App
(`https://www.wetter.com/news/ueber-uns-expertise-daten-qualitaet-verifikation_aid_6a33ddf16335044be70d9f6a.html`,
Abruf 2026-07-31). Bei buscosun liegt sie in einem Unterpanel (`ForecastDeck.tsx:297,511`).
**Mehrwert:** buscosun bekommt einen Satz, der es erklärt: „Wir zeigen dir, wie oft wir richtig lagen."
Das ist gleichzeitig ehrlich, überprüfbar und von keinem Wettbewerber kopierbar, ohne dass er sich
selbst blamiert. Heute muss man das Produkt lange benutzen, um überhaupt zu merken, dass es das gibt.
**Umsetzung:** (1) Kompakte Trefferquoten-Kachel in die Command-Deck-Topbar/Rail des Vorhersage-Decks
und auf die Einstiegsseite (Zahl + Zeitraum + „wie gemessen"-Link); (2) eine Erklärseite „Wie ehrlich
ist diese Vorhersage?" (nutzt den bestehenden SEO-Generator und zahlt zugleich auf GEO/D-22 ein);
(3) Ortsbezug, wo die Datenlage es hergibt. Kein neuer Rechenpfad — reine Platzierung + Redaktion.
Risiken: Die Zahl darf nicht geschönt werden (D-04); Methodik und Grenzen müssen mitangezeigt werden,
inklusive der Abhängigkeit von der Open-Meteo-previous-runs-API (D-18-Kontext beachten).
Abhängigkeit: profitiert von V-05 (Deep-Links) und V-10 (Deck-Shell).
**Quelle:** Produkt & Wettbewerb (Agent-Team), 2026-07-31.

### V-PRD-06 · Modellwahl sichtbar machen (Priorität P1 · Aufwand M · Status offen)
**Was:** Der Per-Land-Modell-Switcher funktioniert (`src/fusion/modelSource.ts:113,205-220`,
UI `src/MapView.tsx:3088,3434-3437`, Handler `:507-510`, Länder-Sync `:550`), ist aber hinter dem
`ModelLibraryOverlay` versteckt — im Normalbetrieb sieht niemand, welches Modell gerade spricht.
Windy zeigt das Modell permanent im Chrome (`https://www.windy.com/`), Pflotsh stellt drei Modelle
nebeneinander (`https://pflotsh.com/de/superhd.html`), Kachelmann macht den Modellvergleich zum
Markenkern (`https://wetterkanal.kachelmannwetter.com/45-grad-in-der-wetter-app-besser-wettermodell-vergleich-und-ensembles-zum-hitze-check/`)
— alle abgerufen 2026-07-31. Nebenbefund: `src/map/ModelSwitcher.tsx:115` (Default-Export) wird
nirgends gerendert — Aufräumkandidat für V-08.
**Mehrwert:** Man sieht auf einen Blick, woher die Zahl kommt, und kann mit einem Tap ein anderes
Modell fragen. Das macht aus einer Blackbox ein nachvollziehbares Werkzeug — und es ist genau die
Kultur, für die Kachelmann-Nutzer bezahlen, hier gratis.
**Umsetzung:** Modell-Chip in der Command-Deck-Topbar (Modellname + Land + Lauf-Zeitstempel), Tap
öffnet das bestehende `ModelLibraryOverlay`; optional ein „Dissens"-Indikator, wenn die Modelle
auseinanderlaufen (Daten liegen in `src/confidence/ensemble.ts` bereits vor). Kein neuer Datenpfad.
Risiko: `MapView.tsx` ist Hochrisiko-Datei (`agents.md` §3) → nur durch die Rendering-Rolle und
möglichst nach V-14 (Zerlegung). Abhängigkeit: D-16 Phase 3 UI.
**Quelle:** Produkt & Wettbewerb (Agent-Team), 2026-07-31.

### V-PRD-07 · Verdichtetes Entscheidungs-Meteogramm (Priorität P2 · Aufwand M · Status offen)
**Was:** buscosun verteilt Temperatur, Niederschlag, Wind, Bewölkung und Unsicherheit über mehrere
Panels. meteoblue macht daraus **ein** dichtes Meteogramm und verkauft genau das als Kern seines
point+-Abos (`https://content.meteoblue.com/de/privatkunden/website-subscriptions/point`, Abruf 2026-07-31).
buscosun hat die Bausteine (`src/confidence/ForecastDeck.tsx:291,481` `UncertaintyChart`,
`src/atmosphere` `SectionChart`), aber keine verdichtete Tages-/Wochengrafik.
**Mehrwert:** Eine einzige Grafik, aus der man die Entscheidung ablesen kann, statt fünf Kacheln, die
man selbst zusammensetzen muss. Für Wiederkehrer ist das der schnellste Weg zur Antwort — und es ist
das Format, für das der stärkste Wettbewerber Geld verlangt.
**Umsetzung:** Neue Deck-Komponente auf Basis der vorhandenen Chart-Bausteine (keine Chart-Bibliothek —
D-06 bleibt gewahrt); Command-Deck-Tokens; das Spread-Band gehört zwingend hinein (D-04). Risiken:
Informationsdichte vs. Mobil-Lesbarkeit → Mobil-Variante nach `mobile-design-guidelines.md`,
Breakpoints 767/1439. Abhängigkeit: V-10 (Deck-Shell).
**Quelle:** Produkt & Wettbewerb (Agent-Team), 2026-07-31.

### V-PRD-08 · PWA als Ersatz für die fehlende Store-Präsenz ausbauen (Priorität P1 · Aufwand S · Status offen)
**Was:** Es gibt keine native App (kein Capacitor/Cordova/React Native/Tauri, kein `ios/`/`android/` —
Grep über das Repo ohne Treffer). Die PWA ist installierbar (`public/manifest.webmanifest:4-15`,
`index.html:16,21-25`, SW `public/sw.js` registriert in `src/main.tsx:14-18`), aber das Manifest hat
17 Zeilen und **weder `shortcuts` noch `share_target`**. Zusätzlich bewirbt `manifest.webmanifest:4`
ein „Arbeitsfenster", das es im Code nicht gibt (Grep in `src/` → kein Treffer) — ein
Ehrlichkeits-Defekt (D-04). Alle Wettbewerber sind in den Stores präsent; Wetter ist die
Widget-Kategorie schlechthin.
**Mehrwert:** buscosun landet mit einem Tap auf dem Homescreen und startet dort direkt in der
richtigen Ansicht — „Regenradar" oder „Meine Tour" als eigenes Icon-Menü, ohne App-Store und ohne
Installation im klassischen Sinn. Das ist der billigste verfügbare Ersatz für eine native App.
**Umsetzung:** `manifest.webmanifest` um `shortcuts` (Regenradar, Karte, Vorhersage, Tour) und
`share_target` (GPX-Dateien direkt an die Tourenplanung teilen — setzt V-05-Deep-Links voraus)
ergänzen; falsche Beschreibung korrigieren; ein dezenter, einmaliger Installations-Hinweis im
Command-Deck-Stil (nie aufdringlich). Risiken: `share_target` braucht saubere Hash-Routen (V-05);
Manifest-Änderungen sind Deploy-relevant, aber nicht in der STOPP-Zone. Aufwand ohne `share_target`: S.
**Quelle:** Produkt & Wettbewerb (Agent-Team), 2026-07-31.

### V-PRD-09 · Einbett-Ansichten für alle Verticals (Priorität P2 · Aufwand M · Status offen)
**Was:** Ein Embed-Mechanismus existiert bereits — aber nur für die Historie
(`src/history/historyExport.ts:60-62` `embedSnippet()`, UI `src/history/HistoryPro.tsx:227`,
chromeloser Render-Pfad `src/history/HistoryPage.tsx:143,175-190`, Styles `src/history/history.css:409-412`).
Karte, Nowcast, Vorhersage, Route und Event haben nichts dergleichen. Wettbewerber monetarisieren
Bilder/Karten aktiv (meteoblue Image API, Kachelmann-Hobby-API im Plus-Abo — Abruf 2026-07-31).
**Mehrwert:** Vereine, Hüttenwirte, Tourismusseiten, Blogs und Schulen können eine buscosun-Ansicht
in ihre eigene Seite einbauen. Jede Einbettung ist zugleich Werbung und ein Rückverweis — Reichweite
ohne Werbebudget. Und es ist die einzige Erlösoption, die weder Account noch Backend braucht (§7 Option E).
**Umsetzung:** Den bestehenden `#embed=1`-Pfad zu einem geteilten Mechanismus verallgemeinern
(chromeloses Rendering + Kopier-Snippet in der Deck-Shell, V-10); je Vertical einen sinnvollen
Ausschnitt definieren; Attributionszeile ist im Embed **Pflicht** (Lizenzen DWD/GeoSphere/MeteoSwiss CC BY).
Risiken: Fremdeinbettung erhöht Netlify-Bandbreite und Upstream-Last (`roadmap.md` §B11) → Rate-/
Größen-Budget vorher festlegen; CSP aus V-07 muss `frame-ancestors` bewusst konfigurieren.
Abhängigkeit: V-05 (Deep-Links), V-07, V-10.
**Quelle:** Produkt & Wettbewerb (Agent-Team), 2026-07-31.

### V-PRD-10 · Amtliche Fremdquellen kontextuell und ehrlich verlinken (Priorität P2 · Aufwand S · Status offen)
**Was:** `src/avalanche.ts:1-8,20-31` löst das Lawinenthema vorbildlich: reines Deep-Link-Mapping auf
SLF (CH), lawinen.report (AT), LWD Bayern (DE) und EAWS, kein Fetch, kein modelliertes Gefahrenlevel,
Schwelle `AVALANCHE_MIN_ELEVATION_M = 1000`. **Dieses Muster ist an keiner anderen Stelle angewandt**,
obwohl die App an vielen Stellen an Grenzen stößt, die andere amtlich abdecken: Warnungen (NINA),
Luftfahrt (offizielles Briefing), Lawine außerhalb des Höhenfilters, Hochwasser.
**Mehrwert:** Wo buscosun aufhört, sagt es, wo es weitergeht — statt den Nutzer allein zu lassen. Das
kostet nichts, macht das Produkt vertrauenswürdiger und ist die praktische Umsetzung des
Ehrlichkeitsprinzips: eine ehrliche Grenze mit Wegweiser ist besser als eine ehrliche Grenze ohne.
**Umsetzung:** Kleines geteiltes Modul `src/officialSources.ts` nach dem Vorbild von `avalanche.ts`
(reines Mapping Land × Thema → Ziel-URL + Betreiber), eingebunden dort, wo die App heute nur „gibt es
nicht" sagt (`src/SearchPage.tsx:658-662`, `warningsCrossCheck` bei `coverage: 'none'`,
Atmosphäre/Route im Winter). Kein Fetch, kein Datenrisiko, kein Haftungsrisiko — nur Links.
Risiko: Link-Rot → jährliche Sichtprüfung in die Betriebsroutine. Sehr geringer Aufwand,
hoher Vertrauensgewinn.
**Quelle:** Produkt & Wettbewerb (Agent-Team), 2026-07-31.

### V-PRD-11 · Föhn, Inversion und Vertikalstruktur für Laien erschließen (Priorität P2 · Aufwand M · Status offen)
**Was:** Die vertikale Kompetenz ist da (`src/atmosphere/AtmosphereDeck.tsx:40` Linsen
Höhenwind/Inversion/Go-No-Go/Föhn/Thermik, `:330-382` Inversion, `src/pointForecast/foehnDetector.ts:1-156`,
`src/atmosphere/FoehnPanel.tsx:12`), aber sie ist als Expertenwerkzeug verpackt und nur über
`#3d=`/`#atm=` erreichbar (`src/App.tsx:82,124`). Der Markt zeigt: Vertikaldaten gibt es reichlich
(Windy, meteoblue, Pflotsh, burnair/XCTherm — alle abgerufen 2026-07-31), aber durchweg in
Profi-Darstellung oder hinter Abos. **Für Laien macht es niemand.**
**Mehrwert:** Wer im Nebel im Tal sitzt, während oben die Sonne scheint, bekommt eine verständliche
Antwort auf „warum" und „bis wann". Wer bei Föhn Kopfschmerzen bekommt, sieht die Lage kommen. Das
sind alltägliche Alpenrand-Erfahrungen, für die es bisher kein Laienwerkzeug gibt — und sie erreichen
weit mehr Menschen als die Gleitschirm-Nische, für die die Funktion heute aussieht.
**Umsetzung:** Eine Laien-Linse „Warum ist das Wetter hier anders als dort?" im Atmosphären-Deck
(Command-Deck, D-27), die die bestehenden Berechnungen in zwei Sätzen erklärt statt in einem Diagramm;
Verknüpfung aus dem Punktforecast heraus („Nebel bis ca. X Uhr — hier ist warum"); Erklärstrecke über
den SEO-Generator (zahlt auf D-22/GEO ein). Kein neuer Rechenpfad. Risiken: Der Föhn-Detektor ist
laut eigener Kennzeichnung „heuristisch/Tier-C" — die Laiensprache darf ihn **nicht** aufwerten (D-04);
Formulierungen sind gate-relevant.
**Quelle:** Produkt & Wettbewerb (Agent-Team), 2026-07-31.

### V-PRD-12 · Plan-B-Mechanik über den Eventplaner hinaus (Priorität P2 · Aufwand M · Status offen)
**Was:** Die stärkste belegte Alleinstellung des Produkts — Ausweichtag + Ausweichort + Entscheidungs-Deadline
(`src/event/eventScoring.ts:699-816`, `src/event/eventAltLocation.ts:92`) — existiert nur im Eventplaner.
Tourenplanung (`src/route/`) und Nowcast haben nichts Vergleichbares. In der Wettbewerbsrecherche wurde
kein Anbieter mit einer Plan-B-Mechanik gefunden.
**Mehrwert:** „Samstag wird's nass — Sonntag ist besser, und du musst bis Freitag 18 Uhr entscheiden."
Dieser eine Satz ist der Unterschied zwischen einer Wetter-App und einem Planungswerkzeug. Er
funktioniert für Hochzeiten genauso wie für die Bergtour, den Fotoausflug und den Grillabend — heute
bekommt ihn nur, wer den Event-Assistenten durchklickt.
**Umsetzung:** `eventScoring`-Plan-B-Logik in ein wiederverwendbares Modul heben (Purity-Grenze D-12
beachten — die Logik ist bereits rein) und in der Tourenplanung als „besseres Zeitfenster"-Hinweis
sowie im Punktforecast als Tages-Alternative anbieten. Funktionserhalt: der Eventplaner bleibt
unverändert. Risiken: `src/event/EventResult.tsx` ist Hochrisiko-Datei (`agents.md` §3) → Extraktion
nur lesend, Rendering neu. Abhängigkeit: keine harte.
**Quelle:** Produkt & Wettbewerb (Agent-Team), 2026-07-31.

### V-PRD-13 · KI-Modelle als solche kennzeichnen und einordnen (Priorität P2 · Aufwand M · Status offen)
**Was:** buscosun ingestiert bereits drei KI-Modelle mit explizitem Flag:
`src/fusion/modelCatalog.ts:227` (AICON, DWD, `ai: true`), `:254` (AIFS Single, ECMWF), `:261` (AIFS ENS);
die Typunion `:36` kennt zusätzlich `aigfs`, `aigefs`, `graphcast`. Nach außen wird das nirgends
kenntlich gemacht. Der Markt: ECMWFs AIFS ist seit 25.02.2025 operativ, das Ensemble seit 01.07.2025,
alles Open Data (`https://www.ecmwf.int/en/about/media-centre/news/2025/ecmwfs-ai-forecasts-become-operational`);
Google DeepMinds WeatherNext 2 speist Google Suche, Gemini, Pixel Weather und die Maps Weather API
(`https://deepmind.google/science/weathernext/`) — beide abgerufen 2026-07-31. **Kein Anbieter
kennzeichnet gegenüber Endnutzern, ob eine Vorhersage aus Physik oder KI stammt.**
*Vorbedingung:* Defekt A1 / V-01 — der `/_ecmwf`-Proxy fehlt in Produktion, d. h. AIFS ist live tot.
**Mehrwert:** Die Frage „Kann man KI-Wettervorhersagen trauen?" beschäftigt gerade alle — und niemand
beantwortet sie im Produkt. buscosun kann als Einziges zeigen, wo Physik und KI sich einig sind und
wo nicht. Wenn beide dasselbe sagen, ist das ein starkes Vertrauenssignal; wenn nicht, ist das eine
ehrliche Warnung. Das ist genau die Marke, die buscosun sein will — und es ist mit den vorhandenen
Daten fast geschenkt.
**Umsetzung:** (1) `ai: true` als sichtbares Chip/Badge im Modell-Picker (V-PRD-06) und in der
Attributionszeile; (2) Physik-vs-KI-Vergleich im Vorhersage-Deck (die Vergleichslogik existiert in
`src/confidence/ModelCompare.tsx`); (3) Erklärseite über den SEO-Generator. Risiken: Aussagen zur
KI-Güte müssen belegt bleiben (D-04) — am besten über den vorhandenen Hit-Rate-Pfad, statt zu behaupten;
die Modell-Verfügbarkeit hängt an V-01. Abhängigkeit: **V-01 zwingend zuerst**, dann V-PRD-06.
**Quelle:** Produkt & Wettbewerb (Agent-Team), 2026-07-31.

### V-PRD-14 · Foto-Licht und Astro-Nacht aus dem Event-Wizard befreien (Priorität P2 · Aufwand S · Status offen)
**Was:** Zwei ausgereifte, differenzierende Features sind nur erreichbar, wenn man im Eventplaner den
passenden Anlass wählt: Foto-Licht (`src/photo/photoLight.ts:1-11`, gerendert `src/event/EventResult.tsx:1224-1332`,
gated auf `activity.id === 'photo'`) und Astro-Nacht (`src/astro/astroNight.ts:1-8`,
`src/astro/lightPollution.ts`, gerendert `EventResult.tsx:316,1360-1389`, gated auf `activity.id === 'stargazing'`).
Es gibt keine eigenständige Seite. Marktvergleich: meteoblue bietet Astronomie-Seeing nur im
kostenpflichtigen point+ (Abruf 2026-07-31); Foto-Apps haben Licht, aber kein Wetter-Ensemble.
**Mehrwert:** Zwei fertig gebaute Stärken werden auffindbar. Wer „Wann ist die goldene Stunde und
wird es dann klar sein?" oder „Ist die Nacht dunkel und wolkenfrei genug?" fragt, findet buscosun
heute nicht — obwohl die Antwort im Produkt schon berechnet wird. Das ist Reichweite ohne Neubau.
**Umsetzung:** Eigene Deck-Ansichten (Command-Deck, D-27) mit eigenem Hash-Deep-Link (V-05), die
dieselben Module aufrufen; der Event-Pfad bleibt unverändert (Funktionserhalt). Zwei SEO-Landingpages
über den bestehenden Generator (D-22). Risiken: `src/event/EventResult.tsx` ist Hochrisiko-Datei →
nur lesend extrahieren. Abhängigkeit: V-05, V-10.
**Quelle:** Produkt & Wettbewerb (Agent-Team), 2026-07-31.

### V-PRD-15 · Trägermodell und Finanzierung entscheiden (Priorität P2 · Aufwand S · Status offen)
**Was:** `roadmap.md` §E hält fest, dass kein Monetarisierungsmodell dokumentiert ist. Die Recherche
zeigt: das im DACH-Wettermarkt meistverkaufte Produkt ist „werbefrei" (Kachelmann, bergfex PRO,
Windy Premium, Ventusky Premium — alle abgerufen 2026-07-31) — und buscosun **ist bereits werbefrei**.
Dieser Hebel steht also nicht zur Verfügung; verkaufbar wären nur Funktionen, die heute alle frei sind,
was direkt mit der Obersten Direktive „Funktionserhalt" kollidiert. Zugleich ist die Zahlungsbereitschaft
niedrig (Foreca ≈2,99 €/Jahr; Windy ≈25,99 €/Jahr für ein globales Profi-Produkt).
**Mehrwert:** Jan bekommt eine bewusste Antwort auf die Frage, wovon das Projekt langfristig lebt —
bevor Betriebskosten (Netlify-Bandbreite bei Multi-MB-GRIBs) oder ein Fördermittel-Zeitfenster die
Antwort erzwingen. Das schützt zugleich die Prinzipien: ohne Entscheidung entsteht der Druck später,
und dann unter schlechteren Bedingungen.
**Umsetzung:** Kein Code — eine Entscheidungsvorlage auf Basis von §7 dieses Dokuments mit den sieben
Optionen (Status quo, Spenden, bezahlter Tier, Einmalkauf, B2B/Embeds, Förderung, White-Label) und
den berührten Entscheidungen (D-01/D-02/D-03 + Funktionserhalt). Ergebnis als neuer `D-NN`-Eintrag in
`decisions.md`. **Nur Jan entscheidet** — dieser Eintrag fordert die Entscheidung ein, nimmt sie nicht vorweg.
**Quelle:** Produkt & Wettbewerb (Agent-Team), 2026-07-31.

### V-PRD-16 · Wettbewerbs- und Quellen-Beobachtung als Routine (Priorität P3 · Aufwand S · Status offen)
**Was:** Die Wettbewerbsanalyse in `roadmap.md` §C war eine Desk-Ersteinschätzung und ist an mehreren
Stellen von der Realität überholt worden — mit direkten Konsequenzen für die Priorisierung: MeteoSchweiz
hat seine Daten 05/2025 geöffnet, GeoSphere stellt Warnungen als CC-BY-4.0-API bereit, wetter.com hat
den Eigentümer gewechselt (12/2025), gegen WetterOnline läuft ein Bußgeldverfahren (04/2026), AIFS ist
operativ (02/2025) und WeatherNext 2 steckt in Google Suche. **All das hätte man 2026-06 nicht wissen
können — genau deshalb braucht es eine Routine.**
**Mehrwert:** Die Roadmap veraltet nicht mehr unbemerkt. Vor allem entgehen keine geöffneten Datenquellen
mehr — jede davon macht eine geplante Arbeit plötzlich viel billiger, so wie es bei der AT/CH-Parität
gerade passiert ist.
**Umsetzung:** Halbjährlicher Kurz-Check als Agenten-Auftrag (eine Seite in `audit/`): Datenlage der
amtlichen Dienste DE/AT/CH, Geschäftsmodell-/Eigentümerwechsel der Top-10-Wettbewerber, neue KI-Modelle,
Rechtsrahmen (BFSG, DSGVO-Verfahren). Ergebnis fließt in `roadmap.md` §C und §D. Kein Code, keine
Abhängigkeit.
**Quelle:** Produkt & Wettbewerb (Agent-Team), 2026-07-31.

---

## 12. STOPP & FRAGEN an Jan

| # | Frage | Warum sie nicht ohne Jan beantwortbar ist |
|---|---|---|
| **S1** | **Monetarisierung: soll es überhaupt eine geben — und wenn ja, welche der Optionen A–G (§7)?** | Grundsatzfrage. Ein bezahlter Tier berührt D-01 (Backend), D-03 (Account) und die Oberste Direktive Funktionserhalt gleichzeitig. Spenden (B) und Förderung (F) berühren nichts. Embeds (E) sind der Mittelweg |
| **S2** | **O-01 (Backend/Push): wird jetzt entschieden?** | Push ist die einzige Table-Stakes-Lücke, die ausnahmslos jeder Wettbewerber geschlossen hat — inklusive aller amtlichen Apps. Solange O-01 offen ist, sind V-16, ein Großteil von Z4 und jede B2B-Option blockiert. Ich empfehle die **Entscheidung** vorzuziehen, nicht zwingend die Umsetzung |
| **S3** | **Greift die BFSG-Kleinstunternehmer-Ausnahme für buscosun?** | Das BFSG gilt seit 28.06.2025 für B2C-Websites und -Apps, nimmt aber Kleinstunternehmen aus. Ob buscosun als privates, nicht-kommerzielles Projekt überhaupt in den Anwendungsbereich fällt, ist eine **Rechtsfrage**, keine Agentenfrage. Sie bestimmt, ob V-12 Pflicht oder Kür ist. Die Impressums-/DSGVO-Pflicht gilt davon unabhängig |
| **S4** | **AT-Pollen-API-Key: Ausnahme oder Edge-Function?** | Der Schlüssel von polleninformation.at ist personengebunden. Im Client wäre er offen (Verstoß gegen die Secret-Freiheit); eine Edge-Function berührt die STOPP-Zone Transport. Beides braucht Jans Entscheidung. Ebenso ist zu klären, ob die Lizenz die Weiterverbreitung in einer öffentlichen App erlaubt |
| **S5** | **Wird KI-Modell-Transparenz zur fünften Differenzierungsachse erhoben?** | Es ist der einzige gefundene völlig unbesetzte Fleck mit unmittelbarer Marktrelevanz, und buscosun hat die Daten schon (`modelCatalog.ts:227,254,261`). Aber eine fünfte Achse verändert die Produktidentität — das entscheidet nicht ein Agent |
| **S6** | **Bestätigt Jan die Nicht-Ziele aus §8.2?** | Luftfahrt, Lawinen-Profis, Ski-Ökosystem, Windsport-Spots, Gleitschirm-Profis, Agrar/PV, B2B mit SLA und globale Reisende bewusst **nicht** zu verfolgen, ist eine strategische Festlegung mit Konsequenzen für den gesamten Masterplan |
| **S7** | **`manifest.webmanifest:4` bewirbt ein „Arbeitsfenster", das es nicht gibt.** Korrigieren? | Kleine Änderung, aber ein Ehrlichkeits-Defekt (D-04) an einer nach außen sichtbaren Stelle |

---

## 13. Gefundene Doku-Inkonsistenzen

### 13.1 `docs/zielgruppen-dach.md` (Stand 2026-06-09) — vier belegte Fehler

| # | Behauptung im Dokument | Realität (Code-Beleg) | Wirkung |
|---|---|---|---|
| **D1** | Zeile 30: **„KI-Meteorologe (`assistant`) — Lokales LLM (WebLLM/WebGPU)"** als SHIPPED gelistet; in Teil B/C mehrfach als Stärke für Hobby-Meteorologen und Lehrende geführt (Z. 175, 178, 205) | **`src/assistant` existiert nicht.** Bestätigt durch `CLAUDE.md` §Stack und `decisions.md` D-24 | Zielgruppen-Bewertungen für „Wetter-Nerds" und „Lehrende" stützen sich teilweise auf ein Feature, das es nicht gibt |
| **D2** | Zeile 29 + 214: **„3D-Globus … gebündelte Public-Domain-Sample-Felder (NASA MERRA-2 + GFS-Sample), KEINE Live-Vorhersage"**, in Teil C als Ehrlichkeitsgrenze 3 geführt | **Falsch.** Der Globus lädt **live** GFS: `src/globe/gfs.ts:18-19` (NOAA `noaa-gfs-bdp-pds` über `/_gfs`), `:50` Lauf-Listing, `:90` `.idx`, `:119` Byte-Range-GRIB2; `GlobeMap.tsx:124,101`; `:158` setzt `windPngUrl: ''` und umgeht das Sample bewusst. Das gebündelte `loadWindGrid()` in `src/globe/windSample.ts:21` ist **toter Code ohne Aufrufer** | Das Dokument macht das Produkt schlechter, als es ist — eine ehrliche Selbsteinschätzung, die in die falsche Richtung irrt |
| **D3** | Zeile 28: **„3D-Wetter (`threed`)"** als eigene Seite/Kachel mit `src/threed/*` | Die Vertikalschnitt-**Seite** ist `src/atmosphere/AtmosphereDeck.tsx` (Linsen `:40`, Inversion `:330-382`, Go/No-Go `:430`), erreichbar über `#3d=`/`#atm=` (`src/App.tsx:82,124`). `src/threed/` existiert noch als **Hilfsmodul-Verzeichnis** (`goNoGo.ts`, `soundingMath.ts`, `crossSection.ts`), aber `ThreeDPage.tsx` ist tot (`roadmap.md` A8) | Falsche Ortsangabe für künftige Agenten |
| **D4** | Zeile 49: **„`climate` wurde gelöscht"** neben Zeile 27 „Historie (`history`) … ERA5" | Nicht falsch, aber irreführend nebeneinander: die Klimafunktionen leben in `src/history/` weiter (`historyIndices.ts:17,31,82` GDD/frostfrei/HDD, Warming-Stripes) | Leser könnten die Klimafähigkeit unterschätzen |

**Zusätzlich nicht mehr aktuell (keine Fehler, aber überholt):** Die „harten Ehrlichkeitsgrenzen"
Nr. 1 (UV/Pollen/Warnungen DE-only) bleiben korrekt, aber die **Begründung** („AT/CH haben kein
Open-Data-Feed", so auch `src/sources/dwdPollen.ts:11-12` und `src/sources/dwdUvForecast.ts:20-21`)
ist seit 2025 überholt: MeteoSchweiz-OGD seit 22.05.2025, GeoSphere-Warnungen als CC-BY-4.0-API.
**Die Code-Kommentare sollten bei der V-13-Umsetzung mitkorrigiert werden.**

### 13.2 `roadmap.md` §C — vier zu korrigierende Aussagen

| # | §C-Aussage | Korrektur |
|---|---|---|
| **R1** | Differenzierungs-These (1): „Tour zur Ankunftszeit … teils Alleinstellung" | **Routenwetter ist kein Alleinstellungsmerkmal.** komoot Premium, wetter.com Routenwetter, Windy Distance & Planning, Epic Ride Weather und WattWeather liefern es. Die echte Alleinstellung ist der **E-Bike-Akku** (`src/route/ebikeBattery.ts:1-28`) und **Event-Phasen + Plan B** |
| **R2** | bergfex-Zeile: „Alpin-Tiefe … ist buscosuns Vorsprung" | Zu breit. Gegen Kachelmann/Pflotsh (1-km-Modelle, natives Gelände) und gegen burnair/XCTherm/Skysight (Thermik) führt buscosun **nicht**. Präzise: „alpine Vertikalstruktur **für Laien**, frei zugänglich" |
| **R3** | MeteoSwiss/GeoSphere-Zeile: „AT/CH-Parität … schließt buscosuns größte Lücke" | Richtig — aber der **Aufwand ist heute erheblich geringer** als angenommen: GeoSphere-Warnungen CC BY 4.0 mit offener API ohne Registrierung; MeteoSchweiz-OGD seit 05/2025. Das rechtfertigt eine Hochstufung in §D |
| **R4** | §C fehlen ganze Kategorien | Nicht erwähnt, aber marktrelevant: **Yr** (bestes UX-Vorbild), **Pflotsh** (direkter DACH-Nischenkonkurrent), **WeatherPro/RainToday** (verwaistes Vakuum), **Google WeatherNext 2** (strukturelle Bedrohung der Mainstream-Schicht), **ECMWF AIFS** (Chance), **burnair/XCTherm** (wo buscosun nicht führt), **komoot** (Routenwetter-Wettbewerb) |

### 13.3 Sonstiges

- **`public/manifest.webmanifest:4`** bewirbt ein „Arbeitsfenster", das im Code nicht existiert
  (Grep in `src/` → kein Treffer) → D-04-Defekt, s. S7.
- **`src/globe/windSample.ts:21`** (`loadWindGrid`) und **`src/map/ModelSwitcher.tsx:115`**
  (Default-Export) sind toter Code ohne Aufrufer → Kandidaten für V-08 (Löschungen brauchen Jans Freigabe).

---

## 14. Offene Fragen / nicht verifizierbar

| # | Offen | Warum |
|---|---|---|
| **O-A** | **Marktanteile DACH** | Keine unabhängige Quelle auffindbar (AGOF/IVW nicht abrufbar). Alle Zahlen in §2 sind Eigenangaben und nur als Größenordnung nutzbar |
| **O-B** | **Aktuelle Preise** Kachelmann, Windy, Windfinder, meteoblue point+ | Nicht am Anbieter-Checkout verifiziert; teils aus Drittanbieter-Guides (Windy) oder undatierten Seiten |
| **O-C** | **Hat Windy oder meteoblue einen frei gezogenen Vertikalschnitt?** | Nicht verifiziert. Beide haben Soundings/Airgram; ein Schnitt entlang einer gezeichneten Linie wurde weder bestätigt noch widerlegt. **Betrifft direkt die Stärke von Achse 2** |
| **O-D** | **Zeigt meteoblue Endnutzern einen retrospektiven Trefferquoten-Wert?** | Nicht verifiziert. meteoblue führt Zuverlässigkeits-Indikatoren; ob das ein Hit-Rate-Rückblick ist, blieb offen. **Betrifft direkt die Stärke von Achse 3 — sollte vor einer Marketing-Aussage geprüft werden** |
| **O-E** | **Ist der E-Bike-Akku wirklich einzigartig?** | Negativbeweis, prinzipiell nicht führbar. In der Recherche kein Wetter-Anbieter mit Akku-Reichweite gefunden; Reichweiten-Rechner im E-Bike-Ökosystem existieren, aber ohne Wetter-/Routen-Kopplung |
| **O-F** | **Welche Produkte umfasst die MeteoSchweiz-OGD genau?** (Warnungen? UV? Pollen?) | Die Öffnung ist belegt, der genaue Produktumfang nicht. **Sondierung ist Teil von V-PRD-03** — es kann sein, dass Warnungen noch nicht enthalten sind |
| **O-G** | **Reichweite von ORF Wetter, wetter.at und SRF Meteo** | Keine Zahlen auffindbar |
| **O-H** | **Werbe-/Tracking-Last** bei Ventusky, Windy, Zoom Earth, Foreca, Windfinder | Nur Anbieterangaben (Store-Texte); keine unabhängige Tracker-Analyse gefunden. Ventuskys „trackerfrei"-Aussage stammt vom Anbieter selbst |
| **O-I** | **Fällt buscosun in den BFSG-Anwendungsbereich?** | Rechtsfrage, s. S3 |
| **O-J** | **Lizenzlage** der Fremddaten (DWD/GeoSphere/MeteoSwiss CC BY, polleninformation.at) für die Nutzung in einer öffentlichen App inkl. Embeds | Formale Prüfung steht aus (`roadmap.md` §E führt es bereits als offene Frage); betrifft V-PRD-02/03/04/09 |
| **O-K** | **Wieviel Nutzung hat buscosun heute überhaupt?** | D-02 (keine Analytics) bedeutet: **alle** Zielgruppen- und Priorisierungsaussagen dieses Dokuments — auch meine — beruhen auf Marktlogik, nicht auf gemessenem Nutzerverhalten. Das ist die größte methodische Schwäche der gesamten Analyse und gehört zur O-06-Abwägung |

---

*Ende. Verfasst von der Rolle **Produkt & Wettbewerb** (`agents.md` §2), 2026-07-31.
Keine Quellcode-, Build- oder Konfigurationsdatei wurde geändert; keine Commits.
Einzige geschriebene Datei: dieses Dokument.*
