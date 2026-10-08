# Phase OB — Stationsmessungen DACH in `buscosun-data/obs/`

> Auftrag Jan 07.10.2026: „buscosun-data so erweitern, dass alle vorhandenen realen Stationen im DACH-Raum mit aktuellen,
> realen Messwerten dort abgebildet werden — auch Stationen, die ausschließlich Niederschlag messen. Berechtigung,
> buscosun-data zu verändern und zu pushen. Die aktuellen Werte sollen immer dort liegen; je Quelle prüfen, wie oft sie
> aktualisiert wird, und die Aktualisierung je Quelle nach diesem Rhythmus einrichten.“

## §0 Kurzfassung

- Neues Produkt `obs/v1/` im Daten-Repo: **Katalog, neueste Werte, 26-h-Reihen (10 min) bzw. 10-Tage-Reihen (täglich), Status**.
  Erster Durchlauf 07.10. 21:30 UTC: **3 123 Stationen, 3 046 mit Werten** (DE 2 346 / 2 274, AT 289 / 284, CH 485 / 485, LI 3 / 3),
  darunter **2 145 reine Niederschlagsstationen** (DE 1 816, CH 327, LI 2), 2 073 davon mit Werten.
- Quellen (alle amtlich, offen, gemessen): DWD CDC 10 min `now` (5 Produkte) + DWD CDC Niederschlag täglich, GeoSphere TAWES
  (+ 1 Klimastation außerhalb TAWES), MeteoSchweiz SwissMetNet, automatische und manuelle Niederschlagsstationen.
- **Takt je Quelle gemessen** (§2.2, Last-Modified und neuester Stempel jede Minute über eine Stunde) und als Abrufplan je
  Quelle eingerichtet (`SOURCES[*].slots` in `scripts/obs/obs-mirror.mjs`): DWD halbstündlich und je Produkt versetzt, TAWES
  10 min, MeteoSchweiz OGD 20 min + Sammeldatei VQHA 10 min, Tagesnetze stündlich geprüft.
- Betrieb: Workflow `obs.yml` (Dauerlauf 340 min, startet den Nachfolger selbst) + `obs-watchdog.yml` (alle 20 min) im
  Daten-Repo, Spiegel als Kopie im Daten-Repo (`scripts/obs-mirror.mjs`) — **läuft ohne Push von buscosun-web**.
- Nicht dabei, weil nicht offen oder nicht aktuell: Niederschlagsstationen der hydrographischen Dienste AT, Landes-/Privatnetze,
  MeteoSchweiz-Türme/Totalisatoren, DWD-Stationen ohne freie Abgabe (V-OB-1…3).

## §1 Diagnose — was es gibt

### §1.1 Netze und Stationen (gezählt 07.10.2026)

| Land | Netz | Zugriff | Stationen | Bemerkung |
|---|---|---|---|---|
| DE | DWD CDC 10 min `now`: `air_temperature` 466, `precipitation` 1 372, `wind` 277, `extreme_wind` 277, `solar` 71 Dateien | je Station und Produkt ein ZIP, Verzeichnis mit Last-Modified | 1 434 mit Datei (904 nur Niederschlag) | die Beschreibungslisten nennen mehr Stationen, als Dateien da sind ⇒ Katalog nur aus Listing ∩ Liste |
| DE | DWD CDC täglich `more_precip/recent` | ZIP je Station, Werte bis Vortag | 2 321 Dateien, 2 272 in den letzten 10 Tagen geändert | 324 Stationen der Beschreibungsliste haben **keine** Datei (keine Abgabe) |
| AT | GeoSphere `tawes-v1-10min` (current + historical) | JSON-API, viele Stationen je Anfrage, 5 Anfragen/s | 288, 286 aktiv | `historical` ist nahezu Echtzeit (Stempel 21:10 um 21:12 abrufbar) |
| AT | GeoSphere `klima-v2-10min` | wie oben | 476 aktiv, davon 285 INDIVIDUAL | ≈ alle an TAWES-Orten (andere Kennung, am selben Stempel wertgleich, 3/3 Stationen × 13 Stempel); nur 3 aktive > 3 km von jeder TAWES-Station, 1 liefert (Treibach-Althofen, 11 km) |
| AT | Hydrographische Dienste (eHYD, Länder) | kein offener Echtzeit-Zugang | — | Lücke V-OB-1 |
| CH/LI | MeteoSchweiz `ogd-smn` | CSV je Station `_t_now` (seit 00 UTC) | 159 | FL (Vaduz) ⇒ LI |
| CH | MeteoSchweiz `ogd-smn-precip` | wie oben | 141 | |
| CH/LI | MeteoSchweiz `ogd-nime` (manuell, täglich) | CSV je Station `_d_recent` | 270 (1 antwortet 403: JUN) | 57 Kürzel = SMN-Ort, 25 = SMN-precip-Ort (je 0 km) |
| CH | `messwerte-aktuell/VQHA80.csv`, `VQHA98.csv` | eine Datei für alle Stationen | 159 / 142 | Kennungen = OGD-Kürzel (158/159, 140/142) |
| CH | `ogd-smn-tower`, `ogd-tot`, `ogd-obs` | | | Türme an SMN-Orten, Totalisatoren (Jahressummen), Augenbeobachtungen — nicht aufgenommen |

### §1.2 Takt je Quelle (gemessen 07.10.2026 21:07–22:08 UTC, Last-Modified jede Minute; Rohdaten im Scratchpad `poll.log`)

| Quelle | Aktualisierung | Inhalt beim Erscheinen |
|---|---|---|
| DWD 10 min Temperatur | :20 / :50 (halbstündlich) | Werte bis ≈ 30 min vor Erscheinen (Datei 20:50 ⇒ letzter Stempel 20:20) |
| DWD 10 min Niederschlag | :10 / :40 | dito |
| DWD 10 min Wind, Böen, Sonne | :15 / :45 | dito |
| DWD täglich Niederschlag | einmal am Tag ≈ 09:15 UTC | Wert des Vortags |
| GeoSphere TAWES | alle 10 min, ≈ 1 min nach dem Stempel | |
| MeteoSchweiz OGD `t_now` (smn, smn-precip) | alle 20 min (:07–:08, :26–:28, :47–:48) | Stempel ≈ 8 min alt |
| MeteoSchweiz VQHA80/98 | alle 10 min (:x0:07) | Stempel 10 min alt; **am selben Stempel wertgleich zu OGD** (37 Stationen, 8 Größen + Wind km/h ↔ m/s: 0 Abweichungen) |
| MeteoSchweiz `ogd-nime` | einmal am Tag ≈ 11:19 UTC | Wert des Vortags |

### §1.3 Zeit- und Einheitenkonventionen (geprüft)

- 10-min-Stempel: UTC, Ende des Intervalls (DWD Doku; TAWES/SMN wie `scripts/punktarchiv/lib/truth.mjs`; klima = TAWES am selben Stempel).
- DWD Tageswert RS(D) = 05:50 UTC D … 05:50 UTC D+1: an Station 00044 an 11 Tagen gegen die 10-min-Summen (z. B. 23.09.: 3,5 mm
  gegen 3,52 mm; die Fenster D−1 und 00–24 UTC passen nicht).
- MeteoSchweiz `rre150d0` = 6 UTC D … 6 UTC D+1, `hto000d0` Morgenmessung 6 UTC (Parameterbeschreibung `ogd-nime_meta_parameters.csv`).
- Umrechnungen: DWD `SD_10` h → min, `GS_10` J/cm² je 10 min → W/m² (× 10 000 / 600), GeoSphere `SO` s → min, VQHA-Wind km/h → m/s.

## §2 Entscheidungen im Auto-Modus

- **A-OB-1 Ort des Codes:** der Spiegel ist EINE abhängigkeitsfreie Datei; Quelle `buscosun-web/scripts/obs/obs-mirror.mjs`, Kopie
  `buscosun-data/scripts/obs-mirror.mjs` (Muster `radar-mirror.mjs`). So wirkt er sofort; der Push von buscosun-web lag nicht in der
  Berechtigung. Jede Änderung ⇒ beide Dateien (V-OB-4: Wächter, der die Kopie vergleicht).
- **A-OB-2 Dauerlauf statt Cron:** GitHub startet geplante Läufe 7–31 min verspätet (gemessen BW-9) — ein 10-min-Takt ist so nicht
  zu halten. Muster Radar-Spiegel: ein Lauf hält 340 min und fragt je Quelle zu ihren Slots ab; Wächter alle 20 min.
- **A-OB-3 Station = Ort:** dieselbe DWD-Kennung in `dwd10`/`dwdDay` und dasselbe MeteoSchweiz-Kürzel in `smn`/`smnp`/`nime` liegen auf
  0 km (geprüft) ⇒ ein Eintrag mit mehreren Netzen. TAWES und klima bleiben getrennt (andere Kennungen); klima nur > 3 km.
- **A-OB-4 Katalog = was geliefert wird:** Stationen aus den Beschreibungslisten nur mit vorhandener aktueller Datei; drei Tage in
  keiner Quelle ⇒ heraus.
- **A-OB-5 Fenster 26 h:** damit eine 24-h-Summe am verzögerten neuesten Stempel vollständig sein kann (bei 24 h fehlte der erste
  Stempel immer: 143/144 gemessen).
- **A-OB-6 Werte unverändert:** keine eigene Plausibilitätsprüfung, keine Glättung; was der Dienst veröffentlicht, steht da (vorläufig).
  Beobachtet: Schneehöhe −1 cm (Sensor). Eine Prüfung wie bei `road/` (harte Regeln) wäre V-OB-5.
- **A-OB-7 VQHA zusätzlich:** schneller als OGD um bis zu 10 min an jedem zweiten Stempel, wertgleich; OGD überschreibt denselben
  Stempel. Fällt VQHA weg (Altprodukt), läuft OGD allein.

## §3 Umsetzung

- `scripts/obs/obs-mirror.mjs` (Spiegel, Selbsttest `--self-test` 12/12), `scripts/obs/workflow-obs.yml`, `workflow-obs-watchdog.yml`
  (Vorlagen der Workflows im Daten-Repo), README-Abschnitt „Stationsmessungen — `obs/`“ in `scripts/repack-repo/README.md` (Vorlage;
  der Kartenpublisher legt sie bei jedem Lauf aus) und gleichlautend im Daten-Repo.
- Publish wie `sea/`/`road/`: jeder Versuch auf frischem `origin/main`, nur `obs/`, ohne Force, bis 6 Versuche; danach Purge der
  veränderten Dateien am CDN. Ein von einem Force-Push der Karten-/Punktlinie verschluckter Commit heilt: DWD/SMN-Dateien tragen
  den ganzen Tag, TAWES wird ab dem neuesten gehaltenen Stempel − 1 h neu geholt.
- Bedingte Abrufe: DWD nur Dateien mit neuem Last-Modified (Verzeichnis), MeteoSchweiz `If-Modified-Since` (304), GeoSphere eine
  Anfrage je 100 Stationen.

## §4 Prüfung und Belege

- Selbsttest `node scripts/obs/obs-mirror.mjs --self-test` **12/12** (Verzeichnisliste, DWD-Produkt mit −999, Solar-Umrechnung,
  Tageswert, OGD „-“/leer, VQHA km/h, rr1h vollständig + Negativkontrolle mit fehlendem Stempel, Reihen-Rundweg exakt, latest,
  Zeitplan, ZIP).
- Voller Lauf lokal 07.10. 21:30 UTC in 50 s: dwd10 2 446 Dateien / 178 608 Werte, dwdDay 2 272 / 21 659, TAWES 286, SMN 159,
  SMN-precip 141, NIME 269 (1 × 403) — 0 sonstige Fehler. Zweiter Lauf direkt danach: 0 neue Dateien (bedingte Abrufe greifen).
- Dauerlauf lokal 21:32–21:56: Slot 21:41 brachte DWD-Niederschlag (1 364 Dateien), TAWES 21:40, SMN/SMN-precip 21:30 über VQHA in
  einem Durchgang; Slot 21:51 SMN-OGD gestaffelt (16 von 159 Dateien schon neu ⇒ Wiederholung nach 3 min).
- Publish gegen ein lokales Test-Repo: nur `obs/` im Commit, fremde Datei bleibt, zweiter Publish ohne Änderung ⇒ kein Commit.
- Daten-Repo: `c7be8e9` (Spiegel, Workflows, README, erster Stand), `obs/README.md` danach; beide überstanden den Force-Push der
  Punktlinie 21:57 (`git ls-tree origin/main` 22:05). Wächter startete `obs.yml` um 22:13:52; erste Bot-Commits `831b917` (22:14:
  dwd10, tawes, smn, smnp) und `e248c64` (22:16: dwd10). Status 22:16 (raw.githubusercontent): 3 123 Stationen, 3 046 mit Werten;
  neueste Stempel DWD 22:00, TAWES 22:10, SMN 22:00, Tagesnetze 06.10.
- CDN: `cdn.jsdelivr.net/gh/jppetry/buscosun-data@main/obs/v1/status.json` 200, `latest.json` 557 KB.
- Plausibilität erster Stand (latest, Wertebereiche): t −2,5…22 °C, rh 35…100 %, ps 656…998 hPa, ff ≤ 20,5 m/s, fx ≤ 25,4 m/s,
  rr10 ≤ 3,3 mm; Schneehöhe −1 cm einmal (A-OB-6).
- Größe: Reihen 26 h ≈ 4–5 MB gesamt (dwd10 ≈ 1,8 MB bei 21 h), latest 0,56 MB, Katalog 0,65 MB.

## §5 Verbesserungen V-OB-n

- **V-OB-1** Österreich: Niederschlagsstationen der hydrographischen Dienste (eHYD) haben keinen offenen Echtzeit-Zugang — Mehrwert:
  dichteres Niederschlagsnetz in den Alpen; Skizze: Anfrage bei den Ländern/BMLUK nach offener Lizenz, sonst nicht.
- **V-OB-2** DWD: 324 Tagesstationen der Beschreibungsliste ohne Datei (keine freie Abgabe) — nur nennen.
- **V-OB-3** MeteoSchweiz `ogd-nime` JUN antwortet 403 — beim Dienst melden.
- **V-OB-4** Wächter in buscosun-web: `scripts/obs/obs-mirror.mjs` = `buscosun-data/scripts/obs-mirror.mjs` (byte-gleich), sonst rot.
- **V-OB-5** Harte Plausibilitätsregeln (negative Schneehöhe, Sprünge) wie `road/` — Mehrwert: Leser bekommen nur gültige Werte;
  Skizze: Quarantäne-Spalte statt Löschen.
- **V-OB-6** Leser in buscosun-web (Karte „Messwerte“, Anker von buscosun Fusion aus `obs/` statt Direktabrufen) — eigene Phase.
