# audit/aktivfeuer.md — Diagnose AF0: Aktiv-Feuer-Größe, -Intensität, -Dynamik

> **Phase AF0** (Auftrag Jan, 2026-08-18: „map the concept onto the actual codebase"). **Diagnose,
> kein Code.** Bewertet wird `konzept-aktivfeuer-modul.md` (Stand August 2026, geschrieben **ohne**
> Zugriff auf dieses Repository) gegen den tatsächlichen Stand von `src/fire/` (uncommitted, s. §2 S3)
> und die Diagnosen BF0/BC1/BP0. Wo das Konzept dem Code widerspricht, ist es falsch und wird hier
> so genannt (§8). Was am Konzept nicht am Code prüfbar war, ist als **unverifiziert** markiert und
> **nicht** übernommen.
>
> Deliverable dieser Phase ist ausschließlich diese Datei. Nichts unter `src/`, kein Commit, kein Start
> der Sentinel-2-/BA-Linie.

---

## 0. Kurzurteil

| | Befund |
|---|---|
| **Machbar wie beschrieben** | Die *Inhalte* der Konzept-Phasen 1–3 — Überflug-Aggregat, Detektionsumring, FRP-Aggregate, FRE mit Gültigkeitsregel, Aktivitätszustand, Ausbreitungsrichtung, `no-signal` **mit** Beobachtungsqualifikation — sind als **reine TypeScript-Module clientseitig** umsetzbar: ohne Bibliothek, ohne Cron, ohne neuen Abruf. Rund **70 % davon existieren bereits** (§3 G) und werden aus dem Konzept **gestrichen**, nicht neu gebaut. |
| **Nicht wie beschrieben** | Python (`src/af/*.py`), Objektspeicher (`store.py`), `activity.json` je Ereignis, stündlicher GHA-Cron, Alpha-Shape (zweimal verworfen: `audit/brandflaechen-echtzeit.md` §2, `audit/waldbrand-cluster.md` §2.4), `event_id de-2026-0817-001` (existiert nicht — die Kennung ist `fire:<detectionKey>`), die Feldnamen `frpSumMw`/`frpMaxMw` mit **anderer Semantik** als in BP1, und die Behauptung, es fehle ein zweites Statusfeld (BP1 hat beide Achsen: `status.kind` + `areaHa.kind`). |
| **Nicht jetzt** | Konzept-Phase 4 (Kalibrierung): braucht die BA-Linie, die es nicht gibt. Biomasse: Faktor unverifiziert (sagt das Konzept §13 selbst). DWD-Bewölkung zum Überflugzeitpunkt: der Client hält nur **Vorhersage-Frames des aktuellen Laufs**; vergangene Überflugzeiten sind nicht abgedeckt. |
| **Zeitkritisch** | Ohne irgendeinen Speicher gehen die Merkmale eines Ereignisses nach ≤ 7 Tagen verloren (FIRMS-Fenster des Clients, §3 F). Die einzige Persistenz ohne Backend ist der GHA-Commit-back — d. h. **Labelpaare hängen an der BA-Entscheidung**. Was AF **jetzt** tun kann: das Merkmalsschema festlegen und die reine Funktion dafür bauen, damit Client und späterer Batch identisch rechnen. |

**Empfehlung in einem Satz:** AF1–AF3 als clientseitige TS-Erweiterung der bestehenden Registry (kein
STOPP-Trigger), AF4 und jede Persistenz **zusammen mit** der BA-Entscheidung — kein AF-eigener Cron.

---

## 1. Gelesen (Reihenfolge wie im Auftrag; jede Position bestätigt)

1. `CLAUDE.md` — Harte Regeln, STOPP-&-FRAGEN-Trigger, Fire-Lehren 1–5, fünf Selbstverifikationsfragen.
2. `agents.md` §§1–7 — Arbeitsablauf, Sperrzonen (`.github/workflows/*`, `netlify/edge-functions/*`), Definition of Done.
3. `konzept-aktivfeuer-modul.md` — vollständig (524 Zeilen, §1–§14).
4. `audit/brandflaechen-panel.md` §2.4 (ID-Regel), §2.5 (Schema-Entwurf), §9 (Gate GBP1: was **wirklich** gebaut wurde) — und, weil das Schema seit BP1 im Code steht, der **gebaute** Vertrag `src/fire/footprint/fireRegistry.ts:63-103` (`FireRecord`) und `:105-125` (`RegistryInput`).
5. `audit/brandflaechen-echtzeit.md` (§2: kein kalibrierbarer Faktor; §3: gepoolt statt je Überflug; §4: Industrieausschluss existiert) und `audit/waldbrand-cluster.md` (§2.1: ein Clustering; §2.4: konvexe Hülle, was sie nicht ist; §3.1: Ortsfest-Vorbehalt; §7: Trend bewusst nicht gebaut).
6. `src/fire/fireClusters.ts`, `src/fire/fireEvents.ts`, `src/fire/footprint/reconcile.ts` — dazu `src/fire/fireZones.ts`, `src/fire/sources/firmsHotspots.ts`, `src/fire/fireEventsWorker.ts`, weil die Antworten auf A/E/G dort liegen.
7. `src/fire/FirePage.tsx` (Detektionseffekt `:312-470`, Registry-Memo `:852-876`, `footprintFc` `:895-900`) und `src/fire/FireMap.tsx` (`GL_LAYERS.fireFootprints` `:145`, Props `:229-237`, `applyState` `:471/:521-524`, Klick `:739`, Fokus `:889-905`, Abhängigkeiten `:963-966`, Hover `:976-977`).

---

## 2. STOPP & FRAGEN (Jan) — gehoben, nicht entschieden

| # | Trigger (Auftrag) | Befund | Offen bei Jan |
|---|---|---|---|
| **S1** | Konzept widerspricht `CLAUDE.md` und der Constraint „no Python" des BP-Prompts | Konzept §4 sieht `src/af/*.py`, `store.py` (Objektspeicher) und §8 einen stündlichen GHA-Cron vor. Repo: reines TS/Vite; **kein** Objektspeicher (kein R2, kein PMTiles — `architecture.md` §14.7, BP0 §2.2); FIRMS wird **clientseitig** über den Edge-Proxy `/_firms` geholt (`src/fire/sources/firmsHotspots.ts:44`), **kein** FIRMS-Poll in GitHub Actions (`.github/workflows/` = `ci`, `health`, `nightly`, `warm-grib`, `warm-wind`; kein `python` in keinem Workflow). `prompt-brandflaechen-panel.md:141`: „Do not add … any Python — those are separate decisions." | Darf überhaupt Python ins Repo? (AF braucht es nicht — §3 A.) |
| **S2** | Frage B würde die Architektur ändern | Ein AF-Batch = neuer Workflow (Sperrzone `agents.md` §3), Commit-back nach `public/` (D-20-Muster, `warm-wind.yml:58-81`), FIRMS-Schlüssel an **zweiter** Stelle (GHA-Secret) oder Abruf über den Prod-Proxy, ein Netlify-Build je Commit. Die **Client-Variante ändert nichts** an der Architektur. | Soll es einen AF-Batch geben? Mein Befund: für Phasen 1–3 **nicht nötig**; für Labelpaare ist er **derselbe** Batch wie BA (§3 B/F). |
| **S3** | „BP1 nicht gebaut / Schema nicht fixiert" | BP1 **ist gebaut** (`fireRegistry.ts`, `verify:fire-registry` 74/74, Gate GBP1 grün, `audit/brandflaechen-panel.md` §9). **Aber:** `src/fire/` ist **vollständig untracked** (`git status --short src/fire` ⇒ `?? src/fire/`; kein Commit seit Anlage). Der Vertrag ist eine Arbeitskopie. AF0 kann die Abbildung (§4) **jetzt** festlegen; was warten muss, ist nur, was BA liefert (`areaHa.kind`-Werte `provisional/final`, `ba:`-Kennungen). | Fire-Baum committen? (offen seit BP0 §7 h) |
| **S4** | Produktentscheidung im Widerspruch zum Konzept | Konzept §5.2: der Umring heißt `detection-extent`, **nie** `upper-bound`, weil die reale Fläche ihn überschreiten kann. BP1 führt `areaHa.kind = 'upper-bound'` (`fireRegistry.ts:88`) und die Zeile „bis N ha" (`areaLabel` `:590`) — Jans Entscheidung vom 2026-08-16 (Hektarzahl auf dem Raster bleibt, mit Obergrenzen-Hinweis; `audit/brandflaechen-echtzeit.md` §7). BF0 §2 belegt am Bestand, dass das Konzept sachlich recht hat: bei den zwei größten Paaren liegen Raster **und** Hülle bei **0,5–0,6×** der kartierten Fläche. Der bestehende Text sagt „vom Satelliten **abgedeckte** Fläche — Obergrenze der Abdeckung, nicht der Brandfläche" (`fireZones.ts:15-24`), das Label „bis N ha" liest sich aber als Obergrenze des Brands. | Umbenennen (`'coverage'`, Label „Abdeckung N ha")? Default: bleibt, V-Kandidat (§9). |

Alles Weitere in dieser Diagnose sind Optionen mit ihren Kosten — keine Entscheidungen.

---

## 3. Antworten A–G

### A · Laufzeit: TypeScript oder Python?

**TypeScript reicht — für alle vier Phasen. Kein Baustein braucht eine Bibliothek.**

| Konzept-Baustein | Braucht | Vorhanden / Aufwand |
|---|---|---|
| Rechteck je Detektion (`scan × track`) | Geometrie-Helfer | **vorhanden**: `footprintRing()` `src/fire/sources/firmsHotspots.ts:426-433` (Rechteck äquirektangulär in Grad, aus `scanKm/trackKm`) |
| Vereinigung der Rechtecke (`unary_union`) | Konzept: shapely | **vorhanden, ohne Lib**: `buildFireZones()` `src/fire/fireZones.ts:472` — Zellsumme + Kantenverfolgung, parameterfrei, mit `MAX_RECTS_PER_ZONE = 3000` (`:78`) als Notbremse |
| Alpha-Shape (`alphashape`, α = 800 m) | Lib (2 Runtime-Deps, D-06) + freier Parameter | **verworfen** — BF0 §2 (kein kalibrierbarer Faktor), BC1 §2.4 (konkave Hülle: zwei plausible Parametersätze, Flächen um Faktor 1,5–2 auseinander). Konzept §5.2 sagt selbst: bei 1–3 Detektionen degeneriert sie, „für DACH ist das der Regelfall". |
| Konvexe Hülle | — | **vorhanden**: `convexHull()` `src/fire/fireClusters.ts:181`, `ringAreaKm2()` `:216` |
| Überflug-Gruppierung, FRP-Summen/Maxima, Trapez-Integral (FRE), FRP-gewichteter Zentroid, Peilung, ±30 %-Regel | Skalar-/Vektorarithmetik | trivial in TS; die Gruppierung existiert bereits je Minute (`fireClusters.ts:271-275`) |
| Wind-Abgleich | Vektorabfrage am Punkt | **vorhanden**: `sampleWindAt()` `src/qa/layerSampler.ts:69-80` (RG-Decode + Denorm; Einschränkung s. AF2 in §5) |
| **Phase 4**: log-lineare Regression + **Prädiktionsintervall**, ein Prädiktor | Konzept: Python-Statistik | geschlossen: OLS (Steigung/Achsenabschnitt), Residual-Standardabweichung, t-Quantil zweiseitig 80 % (df ≥ 23 ⇒ ≈ 1,32; kleine Tabelle oder Cornish-Fisher-Näherung) — **≈ 40 Zeilen TS**, deterministisch, fixture-prüfbar |

Wo Python **einen** Grund hätte: nur, wenn Jan die **BA-Toolchain** Python macht (rasterio-Kette, `konzept-brandflaechen-modul.md`) und `calibrate` aus Homogenitätsgründen dort mitlaufen soll. Das ist eine BA-Entscheidung; **AF hat keinen eigenen Python-Bedarf**. Empfehlung: TS überall — dann liegt Kalibrierung als Node-Skript neben den 50 bestehenden Verifiern und läuft mit `--experimental-strip-types` gegen dieselben Module wie der Client.

### B · Ort: Batch oder Client?

**Phasen 1–3: clientseitig — die Eingaben liegen bereits im Browser.**

Der Client hält beim Öffnen der Brandansicht: alle Detektionszeilen des Fensters (`hotspotRows`, `FirePage.tsx:161`), die Cluster mit Verlauf je Überflug (`FireCluster.passes`, `fireClusters.ts:168`), das Detektionsraster (`fireZones`), die Registry mit Status/Fläche/EMS/EFFIS (`records`, `FirePage.tsx:852-876`) und — bei aktivem `fireWind` — die ICON-D2-Windframes (`wind`, `:153/:610`). Jede Größe aus Konzept §5.1–5.6 ist daraus **ohne zusätzlichen Abruf** ableitbar.

| Option | Was sie kostet | Was sie kann |
|---|---|---|
| **Client** (Empfehlung für AF1–AF3) | +≈ 4–6 kB gzip im Fire-Chunk (Schätzung; Ratsche `budget.json` totalJs 926,1 kB, gemessen 898 kB nach GBP1); Worker-Zeit im Millisekundenbereich (additive Felder in der **bestehenden** Schleife `fireClusters.ts:265-290`); Rechnung je Record über ≤ 8 Überflüge — vernachlässigbar. Kein Cron, kein Speicher, kein Schlüssel. | Alles **innerhalb des Fensters** (24 h / 7 d): Überflug-Tabelle, FRP-Aggregate, FRE, Aktivität, Peilung, Windflag, regionale Beobachtungsgelegenheit. **Nicht:** Verlauf über das Fenster hinaus, sitzungsübergreifende Kennung, Labelpaare, Modelldatei. |
| **Batch (GHA, Commit-back)** | Neuer Workflow (**STOPP**), Cron stündlich = bis 24 Commits/Tag ⇒ bis 24 Netlify-Builds/Tag (heute committen die Warm-Crons nur bei Manifest-Vorrücken, ≈ 8/Tag); FIRMS-Schlüssel als GHA-Secret (zweiter Ort) **oder** Abruf über `https://buscosun.com/_firms/*` (Prod-Proxy, Edge-Cache 30 min); Watchlist/`activity.json` in `public/fire/af/`; ein **Loader im Client** (existiert nicht: das Panel liest heute nur die Registry aus dem Speicher); ≈ 2 Sitzungen + Betrieb. | Persistenz: Verlauf > 7 d, stabile Kennung über Sitzungen, Labelpaare, Modelldatei. |

**Was genuin Persistenz braucht (und nur das):**
1. **Verlauf über das Fenster hinaus** — der Client lädt maximal 168 h (`windowPlan()` `firmsHotspots.ts:260-277`, `MAX_DAY_RANGE = 5` `:60`); ob die Area API mit `date`-Parameter weiter zurückreicht, ist **unverifiziert** (nicht gemessen).
2. **Labelpaare** (Konzept §6) — s. F.
3. **Modelldatei** (`area-estimate-v{n}.json`) — Phase 4.
4. **Sitzungsübergreifende Kennung** — BP0 §7 (b) offen; die Anker-ID ist sitzungsstabil (`carryIds()` `fireRegistry.ts:458`).

**Empfehlung:** Live-Teil = Client. Persistenz = **derselbe** Batch wie die BA-Linie, **täglich** (nicht stündlich: Labels brauchen keine Echtzeit, der Live-Teil läuft im Client), erst nach Jans BA-Entscheidungen (Cron, Speicherweg, Toolchain). **Kein AF-eigener Cron.** Das Konzept begründet den Stundentakt mit „Aktivitätsanzeige = Echtzeitteil" (§8) — genau dieser Teil braucht im Client keinen Takt: er rechnet bei jedem Laden auf den 30-min-gecachten FIRMS-Bytes.

### C · Abgleich mit dem `FireRecord` (BP1)

Das gebaute Schema (`fireRegistry.ts:63-103`) ist der Vertrag; das Konzept passt sich an. Vollständige Tabelle in §4. Ergebnis in Kürze:

- **Bereits vorhanden** (12 Felder): Umring-Geometrie, Umring-Fläche, Detektionszahl, Überflugzahl, Satelliten, Erst-/Letztdetektion, Dauer (ableitbar), Konfidenzverteilung, `no-signal`, „`out` nur mit Quelle", Verlauf je Überflug.
- **Namenskollisionen** (2): Konzept-`frpSumMw` = *letzte Überflugsumme*, BP1-`frpSumMw` = *Fenstersumme* (BC1-Sortierschlüssel, `fireClusters.ts:117`, bleibt); Konzept-`frpMaxMw` = *max Überflugsumme*, `FireCluster.maxFrp` = *max Einzelpixel* (`:119`). ⇒ Neue, eindeutige Namen `frpLastPassMw`, `frpMaxPassMw` — beides aus `passes`.
- **Neu** (9): `freMj`, `activity`, `observationQuality`, `spreadBearingDeg`, `spreadWindAgreement`, `daynightMix`, `meanScanKm`, `areaEst*` (Phase 4, `null`), `featureVersion`.
- **Nicht übernehmen**: `biomassKg` (Faktor am Paper unverifiziert, brennstoffabhängig — Konzept §13), `event_id` (Kennung ist `fire:<anchorKey>`), `envelope` als eigenes Geometriefeld (die Registry zeichnet **eine** Form je Brand, `geometry.kind`; ein zweites Geometriefeld verstieße gegen BF3 „nie zwei Formen").
- **Form**: ein **Unterobjekt `activity: FireActivity | null`** statt 15 flacher Felder — additiv, keine bestehende Zeile ändert sich, `null` im GWIS-Notbetrieb und bei reinen EFFIS-Einträgen (`sources.cluster === null`).

### D · Statusachsen

**Schon getrennt — Kosten 0.** BP1 führt zwei unabhängige Felder:

- `status: { kind: 'active' | 'no-signal' | 'out'; sinceMs; source }` — der **Feuerzustand** (`fireRegistry.ts:75`, gesetzt in `statusOf()` `:203-224`: `out` **nur** mit EFFIS `FINALDATE` oder geschlossener EMS-Aktivierung; `no-signal` ab 24 h ohne Detektion, `ACTIVE_WITHIN_MS` `:127`).
- `areaHa: { value; kind: 'mapped' | 'upper-bound' | null; source; capped }` — der **Kenntnisstand der Fläche** (`:88`).

Die Konzept-Werte `estimated | provisional | mapped | final` sind **Erweiterungen von `areaHa.kind`** (`provisional`/`final`/`ba-net` kommen mit BA), kein Split. Beide Kombinationen aus Konzept §2 sind heute darstellbar: `out` + `upper-bound` (EFFIS-`FINALDATE` auf einer Zone ohne Kartierung — vorkommen kann das nur über EMS, aber das Schema trägt es), `active` + `mapped` (Hohes Venn am 2026-08-17: EMSR920 offen + 2 825 ha EFFIS). Was **nicht** existiert: die Konzept-Werte `activity ∈ growing|stable|declining` — das ist die dritte Achse **Tendenz**, neu (§4).

### E · Eingangsvollständigkeit

**Nichts geht im Ingest verloren. Verloren geht es erst in der Aggregation je Überflug — additiv reparierbar.**

| Pflichtfeld (Konzept §2) | Ingest | Beleg |
|---|---|---|
| `lat`, `lon`, `acq` | ✅ | `FirmsRow.lat/lon/acqMs` `firmsHotspots.ts:85-88`; `acqToUtcMs()` `:112-123` (führende Nullen, F0-Falle 1) |
| `scan`, `track` | ✅ | `scanKm/trackKm` `:97-98`, Parser nach Spaltenname `:180-181/:209-210`; Fixture-Anker „scan/track werden gelesen" `:668`; ohne beide **kein** Rechteck (`footprintRing` `:427`, Anker `:748-750`) |
| `sat` | ✅ | `satellite` `:100/:211` |
| `daynight` | ✅ | `day: boolean` `:102/:212` (`'D'` ⇒ true), Anker `:670` |
| `frp` | ✅ (`null` erlaubt) | `:90/:205` |
| `confidence` | ✅ | `:91/:206`, `normalizeConfidence` (l/n/h **und** low/nominal/high, F0-Falle 2) |
| `bright_ti4`, `bright_ti5` | ✅ | `:93-95/:207-208`, Anker `:666-667` |
| Edge Function | reicht die CSV **unverändert** durch | `netlify/edge-functions/firms.ts:166` (Area-API-URL), Antwort `text/csv` `:202/:235` |
| Cross-Satelliten-Dedup | wirkt **nicht** zwischen Satelliten (0 Treffer in 4 707 Detektionen; SNPP/N20/N21 ≈ 50 min versetzt) | `dedupe()` `:293-322` — zwei Satelliten sind zwei Beobachtungen, genau wie das Konzept es will |
| GWIS-Notbetrieb | `rows: []` | `FirePage.tsx:353-354` — GWIS führt weder `frp` noch `scan/track` (V-199) ⇒ AF ist im Notbetrieb still, wie BC1-Liste und Raster |

**Wo es dünn wird:** `FireCluster.passes` trägt je Überflug nur `{ atMs, pixels, sumFrp }` (`fireClusters.ts:168`, gebaut `:271-275` und `:313-315`). Für Konzept §3 fehlen je Überflug **`sat`, `day`, `frpMax`, FRP-gewichteter Zentroid, `meanScanKm`, `pixelAreaHa`**. Das ist eine **additive Erweiterung in derselben Schleife** (kein zweiter Lauf über die Zeilen — BC1-Lehre) und geht auch durch `mergeClusters()` (`fireRegistry.ts:232-278`, vereinigt `passes` je `atMs`).

**Überflug-Definition heute ≠ Konzept.** Beide Bestandsstellen gruppieren nach **1-Minuten-Slot ohne Satelliten-Trennung** (`fireEvents.ts:261` `Math.floor(acqMs/60_000)`, `fireClusters.ts:271`). Praktisch harmlos, weil die drei Satelliten nie in derselben Minute über DACH sind (`dedupe`-Kommentar `:296-301`) — aber ein Überflug, dessen Pixel über eine Minutengrenze fallen, zählt **doppelt**. Konzept §5.1 (Fenster 10 min **je Satellit**) ist die robustere Regel. Änderung an **einer** Stelle (beide Bestandsmodule teilen sie), sichtbar in `overpasses` und `eventLabel()` (`fireEvents.ts:304`); die Ortsfest-Einstufung F2 hängt **nicht** daran (`distinctDays` + `grew()` `:279`). ⇒ Jan-Frage §7 (4).

### F · Labelpaare — Minimum ab Phase 1

Das Konzept hat hier recht, und der Punkt ist wirklich leicht zu übersehen: **die FIRMS-Detektionen eines Ereignisses sind für den Client nach ≤ 7 Tagen weg** (Fenster 168 h). Die BA-Kartierung kommt im Median 3–5 Tage später und darf bis 45 Tage suchen. Wer die Merkmale nicht **vor** Ablauf des Fensters festhält, hat zum Labelzeitpunkt nichts mehr.

Was **jetzt** entschieden und gebaut werden kann, ohne dass BA existiert:
1. **Merkmalsschema fixieren** — als TS-Typ neben dem `FireRecord`, versioniert (`featureVersion: 1`), mit den Konzept-Merkmalen `nDetections, nOverpasses, frpMaxPassMw, freMj|null, durationH, coverageHa` (statt `envelope_area_ha`), `sensorFamily` (immer `'VIIRS'`), `daynightMix`, `landcoverDominant`, `month`, plus die BP1-Größen `confidence`, `suspectedStatic`, `hullKm2`.
2. **Reine Funktion `activityFeatures(record)`** im Client, verifiziert — sie ist die Referenzimplementierung; ein späterer Batch importiert **dieselbe** Datei (Node strip-types) ⇒ Parität per Konstruktion.
3. **Anzeigen** — die Merkmale stehen in der Detailkarte, damit sie ab Tag 1 überprüfbar sind.
4. **Persistenz-Haken benennen, nicht betreiben:** Der BA-Watchlist-Eintrag (`konzept-brandflaechen-modul.md`) speichert die Merkmale **zum Trigger-Zeitpunkt** und friert sie bei `t_end + 7 d` ein — danach ändern sie sich nicht mehr, weil keine Detektion mehr im Fenster ist. Ziel `ba_status ∈ {mapped, final}`, `separability ≥ 1,5` — wie Konzept §6.

Was **nicht** ohne Batch geht: irgendetwas festhalten. Interimsoption „Feature-Logger" (täglicher Cron, schreibt `public/fire/af/features-2026.jsonl` per Commit-back, ≈ 0,5 Sitzung + Betrieb) ist ein **neuer Cron ⇒ STOPP** (§2 S2). Die Saison läuft (Stand August 2026, EMSR920 offen) — jeder Monat ohne Speicher kostet Paare. **Entscheidung Jans**, Default: mit BA, kein Interim (§7 (9)).

### G · Überlappung — was aus dem Konzept gestrichen wird

Alles in dieser Tabelle existiert, ist verifiziert und wird **nicht** neu gebaut; das Konzept verweist künftig darauf.

| Konzept | Existiert als | Beleg |
|---|---|---|
| §5.1 Überflüge bilden | `overpasses` + `passes` je Cluster; `overpasses` je Ereignis | `fireClusters.ts:271-275,313-315`; `fireEvents.ts:261` |
| §5.2 Rechteck-Union | Detektionsraster (Zonen), Fläche in ha, `capped`-Ehrlichkeit | `fireZones.ts:472 buildFireZones`, `FireZone` `:80-107` |
| §5.2 „Umring" als Hülle | konvexe Hülle je Cluster + `hullKm2` | `fireClusters.ts:181,216`; was sie **nicht** ist: `audit/waldbrand-cluster.md` §2.4 |
| §5.3 FRP Σ / max | `sumFrp`, `maxFrp` je Cluster **und** `sumFrp` je Überflug | `fireClusters.ts:265-290` |
| §5.5 „neue Detektionen am Rand" (räumliches Wachstum) | `grew()` — Ausdehnung/Drift erste vs. zweite Hälfte, Schwelle eine Pixelbreite | `fireEvents.ts:223-235` |
| §5.5 Aktivitätszustand | `FireEvent.trend ∈ growing|steady|quiet` — **Zählregel** (späte vs. frühe Hälfte ×1,3), nicht FRP | `fireEvents.ts:237-246`, Label `:319`. BC1 hat Trend je Cluster **bewusst nicht** gebaut (`audit/waldbrand-cluster.md` §7) |
| §5.6 „`out` nie aus fehlender Detektion" | `statusOf()` — `out` nur EFFIS `FINALDATE` / EMS geschlossen, sonst `no-signal` | `fireRegistry.ts:203-224` |
| §2 Ende-Kennzeichnung mit Quelle | `status.source` (Text nennt die Quelle) | `fireRegistry.ts:207-222`, `statusLabel()` `:576` |
| §1 Verhältnis zu BA / EFFIS-Kartierung | Abgleich Zone ↔ EFFIS, ±14 d, beidseitig | `footprint/reconcile.ts:66-83,90,103-125` |
| Merge/Split über Läufe | `carryIds()` (Anker-Wanderung, `mergedFrom`, `splitFrom`) | `fireRegistry.ts:458` |
| Cluster derselben Kartierung = ein Brand | `mergeClusters()` | `fireRegistry.ts:232-278` |
| Landbedeckung, Ort, EMS, Konfidenzverteilung, Satelliten | Registry-Felder | `fireRegistry.ts:63-103` |
| Industrie-/Dauerquellen-Ausschluss | CLC-Maske + Persistenz, ausgegraut nie ausgeblendet | `audit/brandflaechen-echtzeit.md` §4 (nicht Teil des Konzepts, aber die Registry trägt `suspectedStatic`) |

**Zwei Wahrheiten vermeiden:** `FireEvent.trend` (Ereignis, 1 500 m/48 h, Zählregel) und das Konzept-`activity` (Record, 2 000 m/Fenster, FRP-Regel der letzten drei Überflüge) sind **verschiedene** Größen mit ähnlichen Namen. Sie dürfen nicht dieselbe Beschriftung tragen — s. §7 (6).

---

## 4. Mapping-Tabelle Konzept §2/§7 → `FireRecord`

| Konzeptfeld | Status | BP1-Feld / Herkunft | Anmerkung |
|---|---|---|---|
| `envelope` | vorhanden (anders) | `geometry.kind ∈ effis|raster|hull|point`, `sources.zones`, `sources.cluster.hull` | **kein** zweites Geometriefeld (BF3) |
| `envelopeAreaHa` | vorhanden, **Namenskonflikt** | `areaHa{value, kind:'upper-bound'}` (Zone) bzw. `sources.cluster.hullKm2` | Konzept: nie „upper-bound" ⇒ §2 S4; Vorschlag `kind:'coverage'` |
| `frpSumMw` (letzte Überflugsumme) | **Kollision** | neu `activity.frpLastPassMw` ⇐ `passes[last].sumFrp` | BP1-`frpSumMw` = Fenstersumme bleibt (BC1-Sortierung) |
| `frpMaxMw` (max Überflugsumme) | **Kollision** | neu `activity.frpMaxPassMw` ⇐ `max(passes.sumFrp)` | `FireCluster.maxFrp` = max Einzelpixel bleibt |
| `freeMj` (FRE) | neu | `activity.freMj` — Trapez über `passes` (`atMs`, `sumFrp`), `null` wenn < 3 Det. über < 2 Überflüge | „nicht bestimmbar", nie 0 |
| `biomassKg` | **nicht übernehmen** | — | Faktor unverifiziert (Konzept §13); frühestens nach Paper-Prüfung |
| `activity` growing/stable/declining/no-signal | neu (`no-signal` vorhanden) | `activity.state`; `no-signal` ⇐ `status.kind` | Regel: letzte 3 Überflüge **derselben** Tageshälfte; `growing` = FRP↑ **und** Randwachstum (`grew`-Logik) |
| `observationQuality` confirmed/unobserved | neu | `activity.observation` ⇐ regionale Aktivität je Slot (aus `hotspotRows`) | DWD-Wolke: nicht abdeckbar (Vorhersage-Frames), s. AF2 |
| `spreadBearingDeg` | neu | `activity.spreadBearingDeg` ⇐ FRP-gewichtete Zentroide der `passes` (≥ 3 Überflüge) | braucht Zentroid **je Überflug** (additiv in `passes`) |
| `spreadWindAgreement` | neu | `activity.windAgreement ∈ agree|disagree|null` ⇐ `sampleWindAt` | nur wenn `fireWind` geladen und Frame ±3 h; Flag, keine Korrektur |
| `areaEstHa/Low/High/Method` | Phase 4 | `activity.areaEst: null` bis Modell | Intervall zwingend, 80 % |
| `nDetections` | vorhanden | `hotspots` | |
| `nOverpasses` | vorhanden | `overpasses` | Definition s. E |
| `durationH` | ableitbar | `(lastMs − firstMs)/3.6e6` | |
| `sensorFamilies` | vorhanden | `satellites` (nur VIIRS-Plattformen; MODIS nicht ingestiert) | „je Sensorfamilie führen" ist trivial: eine Familie |
| `daynightMix` | neu | `activity.daynightMix ∈ D|N|DN` ⇐ `day` je Überflug (additiv) | |
| `meanScanKm` | neu | `activity.meanScanKm` je Überflug (additiv) | Off-Nadir-Kennzeichnung |
| `firstDetection`, `lastDetection` | vorhanden | `firstMs`, `lastMs` | |
| Feuerzustand `active|no-signal|out` | vorhanden | `status.kind` | |
| Kenntnisstand `estimated|provisional|mapped|final` | vorhanden (2 von 4 Werten) | `areaHa.kind` (`upper-bound`≙`estimated`, `mapped`) | `provisional`/`final` mit BA |
| `event_id` | **nicht übernehmen** | `id = fire:<anchorKey>` bzw. `effis:<id>` | BP0 §2.4 |
| Überflug-Aggregat §3 | vorhanden (3 von 9 Feldern) | `passes[] = {atMs, pixels, sumFrp}` | additiv: `sat, day, frpMax, lat, lon, meanScanKm, pixelAreaHa` |
| `activity.json` je Ereignis | entfällt | — | Client hält Records im Speicher; Persistenz s. B/F |

Vorgeschlagene Signatur (nur Skizze, kein Code):

```ts
export interface FireActivity {
  version: 1;
  passes: FirePass[];                       // erweitert: sat, day, pixels, sumFrp, maxFrp, lat, lon, meanScanKm, pixelAreaHa
  frpLastPassMw: number | null;
  frpMaxPassMw: number | null;
  freMj: number | null;                     // null = nicht bestimmbar (< 3 Det. über < 2 Überflüge)
  state: 'growing' | 'stable' | 'declining' | 'no-signal' | null;   // null = < 2 vergleichbare Überflüge
  observation: 'confirmed' | 'unobserved' | null;                   // nur bei no-signal
  spreadBearingDeg: number | null;          // null bei < 3 Überflügen
  windAgreement: 'agree' | 'disagree' | null;
  daynightMix: 'D' | 'N' | 'DN' | null;
  meanScanKm: number | null;
  areaEst: { ha: number; lowHa: number; highHa: number; method: string } | null;   // Phase 4
}
// FireRecord bekommt additiv:  activity: FireActivity | null;
```

---

## 5. Korrigierte Modulstruktur und Phasenplan

**Nicht** `src/af/*.py`, sondern:

```
src/fire/activity/
  overpasses.ts    Überflug-Aggregat aus den (erweiterten) Cluster-`passes`; 10-min-Regel je Satellit (Jan-Frage 4)
  intensity.ts     frpLastPass / frpMaxPass, FRE mit Gültigkeitsregel — KEINE Biomasse
  dynamics.ts      state (FRP-Regel + Randwachstum), spreadBearing (≥ 3 Überflüge), windAgreement-Flag
  observation.ts   observationQuality aus regionaler Aktivität je Slot (aus denselben Zeilen); DWD-Wolke nur wenn Frame ±Δ
  features.ts      Labelpaar-Merkmale, versioniert, pur (Referenz für Client UND späteren Batch)
scripts/verify-fire-activity.mjs
```

Einhängen — **ohne** neuen Layer, ohne neues Zeitmodell, ohne neuen Abruf:
- `FireCluster.passes` additiv erweitern (`fireClusters.ts:265-290`, `mergeClusters` `fireRegistry.ts:250-260`).
- `buildFireRegistry()` setzt `record.activity` (pur, `nowMs` hereingereicht, D-12); Wind/Beobachtung über optionale Callbacks in `RegistryInput` (Muster `landcoverAt`/`placeAt` `fireRegistry.ts:113-124`).
- Detailkarte `FireFootprintPanel.tsx:386-470`: neue `<dt>`-Zeilen (Überflug-Tabelle ersetzt die heutige `passes`-Liste `:456-470`; FRE; Tendenz; Richtung; Beobachtung), Sprachregeln aus Konzept §7 (FRE `null` = „nicht bestimmbar"; `no-signal` immer mit Beobachtungsqualität; „erloschen" nur mit Quelle — letzteres steht schon).
- Wind: `sampleWindAt()` liegt in `src/qa/layerSampler.ts` und zieht `temperatureLabels` mit (`:15`) — **nicht** das QA-Modul in den Fire-Chunk importieren, sondern die 12 Zeilen (RG-Decode + `windFrameAtValidTime` `iconD2WindSource.ts:496`) an eine geteilte Stelle ziehen. Vergangene Zeitpunkte: `windFrameAtValidTime` interpoliert relativ zu `runAt` — für einen Überflug **vor** dem Lauf klemmt es auf den ersten Frame; das Flag darf nur gesetzt werden, wenn |Δt| zwischen Überflug und Frame ≤ 3 h, sonst `null`.

| Phase | Inhalt | Aufwand (Sitzungen à ~4 h) | Risiken |
|---|---|---|---|
| **AF1** Überflüge + Intensität | `passes` additiv; Überflug-Regel (10 min/Sat, falls Jan ja); `overpasses.ts`, `intensity.ts`; `activity` im Record; Detailzeilen; Verifier (Fixtures: ein Satellit über Minutengrenze = **ein** Überflug; zwei Satelliten in 10 min = **zwei**; FRE `null` bei Einzelüberflug; FRE eines bekannten Trapezes; Kollisionsanker: `frpSumMw` unverändert Fenstersumme) | 1,5 | sichtbare Überflugzahl ändert sich (Gate: `eventLabel` bewusst); FRE-Trapez über 6–12-h-Lücken — Unsicherheit ausweisen; kein `Date.now()` in `src/fire/activity/*` |
| **AF2** Dynamik + Beobachtung | `dynamics.ts`, `observation.ts`; Tendenz-Chip in Zeile + Detail; Windflag; regionale Beobachtungsgelegenheit (Slot mit Detektionen ≤ 150 km, aber keine im Cluster ⇒ Überflug hatte Sicht ⇒ `confirmed`; sonst `unobserved`) | 1,5 | zwei Tendenzen im Produkt (`FireEvent.trend` vs `activity.state`) — Beschriftung trennen; Wind = Vorhersage des aktuellen Laufs; regionale Sicht ist ein grober Proxy (Regionalwolke ≠ Lokalwolke) — als solcher beschriftet; DACH-BBox begrenzt den 150-km-Radius am Rand |
| **AF3** Merkmalsschema | `features.ts` + Schema-Doku (`docs/`), Paritäts-Verifier, Persistenz-Haken **benannt** (Watchlist-Feld), nicht betrieben | 0,5 | ohne BA-Batch keine Labels — Zeitverlust je Monat (§3 F) |
| **AF4** Kalibrierung | Node-Skript im BA-Batch (`scripts/fire/calibrate.mjs`), Modelldatei `public/fire/af/area-estimate-v1.json`, Client-Schätzung **nur** mit Intervall; `min_pairs_for_fit = 25`, `interval_level = 0,80` in die Methodik | 2 | **blockiert** bis BA-Linie läuft und ≥ 25 Paare vorliegen; realistisch nach einer Saison; Stichprobenbias nur für Detektierte gültig (Konzept §6 — in die Methodikbeschreibung) |

**Summe AF1–AF3: ≈ 3,5 Sitzungen, keine STOPP-Zone. AF4: 2, nach Freigaben.**
Verifikation je Phase wie GBP1: `typecheck`, `verify:fire-*` (neu `verify:fire-activity`), `budget`, MCP Desktop 1440×900 + iPhone 12 Pro, Long Tasks am Prod-Build, fünf Selbstverifikationsfragen.

---

## 6. Aufwand und Risiken (Zusammenfassung)

- **Bundle**: +≈ 4–6 kB gzip Fire-Chunk (Schätzung); Ratsche 926,1 kB, Stand 898 kB — Puffer reicht; `eagerJs` unberührt (Lazy-Chunk).
- **Rechenzeit**: additive Felder in bestehender Schleife; Record-Rechnung über ≤ 8 Überflüge — kein Long-Task-Risiko; Messung trotzdem am Prod-Build (GBP1-Muster: 130 ms max im Panelfluss).
- **Fachlich größtes Risiko**: `no-signal` ohne Beobachtungsqualifikation wird als Löschung gelesen (Konzept §5.6 — „der wahrscheinlichste inhaltliche Fehler dieses Moduls"). Der Bestand sagt heute „kein Signal seit X" (`statusLabel`); AF2 fügt „Sicht gegeben / nicht beobachtet" hinzu. Bis dahin steht der Hinweis im Steckbrief (`FireLayerCard.tsx:268`: „Wolken und Überflugslücken verbergen Feuer").
- **Produktrisiko**: zwei Tendenzen, zwei FRP-Maxima, „bis N ha" vs. Konzept-Semantik — jede Größe braucht ihren Namen und ihren Hinweis, sonst entstehen die „zwei Wahrheiten", vor denen BC1 §3.1 warnt.
- **Prozessrisiko**: `src/fire/` untracked (§2 S3); `plan.md`/`checklist.md`/`context.md`/`improvements.md` fehlen weiterhin — Gate-Protokolle landen in `audit/*.md`, V-Kandidaten in §9.

---

## 7. Offene Fragen an Jan (nummeriert; Default gilt, wenn unbeantwortet)

1. **Laufzeit** — TypeScript (Empfehlung) oder Python? *Default: TS.* Python nur, wenn die BA-Toolchain es wird und `calibrate` dort mitlaufen soll (S1).
2. **Ort** — AF1–AF3 im Client, Persistenz mit dem BA-Batch (täglich)? *Default: ja.* Ein AF-eigener Cron ist STOPP (S2).
3. **Wortwahl `upper-bound`** — umbenennen in `coverage` + Label „Abdeckung N ha (Satellitenpixel)" statt „bis N ha"? *Default: bleibt (Entscheidung 2026-08-16); V-Kandidat §9.* (S4)
4. **Überflug-Definition** — 10 min je Satellit (Konzept §5.1) statt 1-Minuten-Slot? *Default: ja*, ändert sichtbar `overpasses`/`eventLabel`; F2 unberührt.
5. **Biomasse** — bauen? *Default: nein* (Faktor unverifiziert; erst nach Prüfung am Paper als Größenordnung mit Unsicherheit).
6. **Tendenz** — `FireEvent.trend` (Ereignis, Zählregel) und `activity.state` (Record, FRP-Regel) beide behalten? *Default: beide, getrennt beschriftet* („Detektionen nehmen zu" vs. „FRP-Verlauf steigend + Randwachstum"); V-Kandidat „vereinheitlichen".
7. **Windflag** — nur wenn `fireWind` geladen ist (kein Extra-Abruf)? *Default: ja*, sonst `null` mit Grund.
8. **DWD-Bewölkung** für die Beobachtungsqualität — nachladen (`iconD2Clouds.ts`, Vorhersage-Frames; vergangene Überflüge nicht abgedeckt)? *Default: nein*, nur regionale Aktivität, ehrlich beschriftet.
9. **Feature-Logger-Interim** (täglicher Cron ⇒ STOPP) bis BA läuft? *Default: nein* — mit BA; Kosten des Wartens: Paare der laufenden Saison.
10. **`src/fire/` committen** und Prozessdateien wiederherstellen/neu anlegen? *Default: unverändert; als Risiko notiert.*
11. **FRE im UI** zeigen (mit `null`-Regel und Unsicherheitshinweis)? *Default: ja*, im Detail, nie in der Zeile.

---

## 8. Was das Konzept über dieses Projekt falsch annimmt

| # | Konzept sagt | Tatsächlich | Beleg |
|---|---|---|---|
| 1 | Module in Python `src/af/*.py`, `store.py` Objektspeicher | reines TS-Repo, kein Objektspeicher (kein R2/PMTiles/Netlify Blobs), Constraint „no Python" | `package.json`, `architecture.md` §14.7, `prompt-brandflaechen-panel.md:141` |
| 2 | Verarbeitung in GitHub Actions, FIRMS-Poll stündlich | FIRMS läuft **clientseitig** über Edge-Proxy `/_firms` mit 30-min-Cache; kein Fire-Workflow in GHA | `firmsHotspots.ts:44`, `.github/workflows/*` (5 Workflows, keiner FIRMS) |
| 3 | `event_id` „de-2026-0817-001" vom Cluster-Modul | Kennungen: `FireCluster.id` = `lat,lon@firstMs` (`fireClusters.ts:110`), Registry `fire:<detectionKey>` / `effis:<id>` (`fireRegistry.ts:200-201`) | BP0 §2.4 |
| 4 | Umring per Alpha-Shape (α = 800 m), Rechteck-Union nur Rückfall | Alpha-Shape zweimal verworfen; Rechteck-Union ist die **Regel** und parameterfrei | BF0 §2, BC1 §2.4, `fireZones.ts:26-34` |
| 5 | Rechtecke „in UTM" | äquirektangulär in Grad, auf `metersBetween`-Näherung abgestimmt; kein UTM im Repo | `footprintRing` `firmsHotspots.ts:426-433`, `fireZones.ts:52-53` |
| 6 | `frpSumMw` = letzte Überflugsumme, `frpMaxMw` = max Überflugsumme | `frpSumMw` = Fenstersumme (Sortierschlüssel BC1), `maxFrp` = max Einzelpixel | `fireClusters.ts:117-119` |
| 7 | „Der `FireRecord` braucht **zwei** Statusfelder" (fehlen) | hat sie: `status.kind` + `areaHa.kind` | `fireRegistry.ts:75,88` |
| 8 | „Die DWD-Anbindung liegt bereits vor" (Wind + Wolke) | Wind: ja, als RG-Textur (`IconD2Wind` `iconD2WindSource.ts:124-129`) mit Sampler in `src/qa/layerSampler.ts:69`; Wolken: Quelle `iconD2Clouds.ts` existiert, wird in der Brandansicht **nicht** geladen; beides **Vorhersage** des aktuellen Laufs — vergangene Überflugzeiten nicht abgedeckt | `FirePage.tsx:153,610`; kein `clct` in `src/fire/` |
| 9 | Zeitreihe „je Sensorfamilie führen, nicht mischen" | nur VIIRS ingestiert (`FIRMS_SOURCES` = 3 VIIRS-Ströme); MODIS/geostationär nicht | `firmsHotspots.ts:57` |
| 10 | Überflug = 10 min je Satellit | Bestand: 1-Minuten-Slot ohne Satelliten-Trennung | `fireEvents.ts:261`, `fireClusters.ts:271` |
| 11 | `t_start`/`t_end` und Verlauf über das ganze Ereignis | Client kennt nur das Fenster (24 h / 168 h); außerhalb nichts | `windowPlan` `firmsHotspots.ts:260`, `fireTime.ts` |
| 12 | `no-signal` „nach 2 Überflügen ohne Detektion" (Konfig §9) | Bestand: 24 h ohne Detektion (`ACTIVE_WITHIN_MS`) — Überflugslücke ausdrücklich ≠ Ende | `fireRegistry.ts:127,203-224` |
| 13 | Panel liest die Batch-Ausgabe (`activity.json`) | Panel liest die **im Speicher** gebaute Registry; kein Loader für Batch-Ausgaben existiert | `FirePage.tsx:852-876`, `FireFootprintPanel.tsx` |
| 14 | Geostationäre FIRMS-Detektionen als optionale Quelle | nicht ingestiert; wäre neue Quelle (`FIRMS_SOURCES`) | `firmsHotspots.ts:57` |
| 15 | „Umring heißt nicht upper-bound" | BP1 nennt die Zonenfläche `upper-bound`/„bis N ha" — Konzept hat sachlich recht (S4), Entscheidung liegt bei Jan | BF0 §2, `fireRegistry.ts:88`, `:590` |

**Unverifiziert (nicht übernommen, nicht widerlegt):** FEDS-α ≈ 1 km (Chen et al. 2022); Wooster et al. 2005 r² = 0,90/0,98 und 14 ± 3 % Strahlungsanteil; „MODIS Swath-Rand Faktor 1000"; Reichweite des `date`-Parameters der Area API über 7 Tage zurück; ob 30–80 Paare je Saison erreichbar sind.

---

## 9. Verbesserungs-Kandidaten (D-28; Nummern folgen, sobald `improvements.md` existiert)

- **V-AF-1** `areaHa.kind 'upper-bound'` → `'coverage'`, Label „Abdeckung N ha" — Mehrwert: die Zahl liest sich nicht mehr als Maximalfläche des Brands (BF0 §2: in 2 von 9 Fällen liegt sie **unter** EFFIS). Skizze: Wert umbenennen, `areaLabel()`/Steckbrief/Verifier-Anker nachziehen (S4, Jan).
- **V-AF-2** Überflug-Definition an **einer** Stelle (`sat` + 10-min-Fenster), von `fireEvents` und `fireClusters` geteilt — Mehrwert: kein Doppelzählen an Minutengrenzen; Skizze: kleine Hilfsfunktion `passKey(row)` in `firmsHotspots.ts`.
- **V-AF-3** `FireEvent.trend` und `activity.state` vereinheitlichen oder eindeutig beschriften — Mehrwert: keine zwei Tendenzen für ein Feuer.
- **V-AF-4** `sampleWindAt` aus `src/qa/` an eine geteilte Stelle ziehen — Mehrwert: Wiederverwendung ohne QA-Import im Fire-Chunk.
- **V-AF-5** Merkmalsschema jetzt fixieren (AF3) — Mehrwert: die erste Kalibrierung verschiebt sich nicht um eine Saison (Konzept §12).

---

## Belege

- Konzept: `konzept-aktivfeuer-modul.md` (§1–§14, gelesen 2026-08-18)
- Bestandscode (alle Zeilenangaben Stand Arbeitskopie 2026-08-18, `src/fire/` untracked): `src/fire/fireClusters.ts`, `fireEvents.ts`, `fireZones.ts`, `footprint/reconcile.ts`, `footprint/fireRegistry.ts`, `sources/firmsHotspots.ts`, `fireEventsWorker.ts`, `FirePage.tsx`, `FireMap.tsx`, `FireFootprintPanel.tsx`, `FireLayerCard.tsx`; `src/qa/layerSampler.ts`; `src/wind/iconD2WindSource.ts`; `netlify/edge-functions/firms.ts`; `.github/workflows/*.yml`; `budget.json`
- Diagnosen: `audit/brandflaechen-echtzeit.md` (BF0), `audit/waldbrand-cluster.md` (BC1), `audit/brandflaechen-panel.md` (BP0 + Gate GBP1 §9)
- Regeln: `CLAUDE.md`, `agents.md`, `prompt-brandflaechen-panel.md`, `docs/DATA_SOURCES.md` §W.2.1 (FIRMS-Freigabe, Transaktionsbudget)
- Repo-Zustand: `git status --short src/fire` ⇒ `?? src/fire/`

---

## 10. Entscheidungsprotokoll (Jan, 2026-08-18)

Jan hat **alle** Fragen mit der jeweils empfohlenen Antwort bzw. dem Default beantwortet
(„ich würde alles mit deiner empfohlenen Antwort beantworten"). Damit gilt für AF1–AF4:

| Frage | Entscheidung |
|---|---|
| S1 Python | **Nein** — AF vollständig in TypeScript; Kalibrierung (AF4) als Node-Skript. |
| S2 AF-eigener Batch/Cron | **Nein** — Live-Teil im Client; Persistenz (Labelpaare, Verlauf > Fenster, Modelldatei) erst mit dem BA-Batch, täglich, nach den BA-Freigaben. |
| S3 `src/fire/` committen | **Unverändert** (kein Commit ohne Auftrag); Risiko bleibt notiert. |
| S4 `upper-bound` umbenennen | **Bleibt** wie am 2026-08-16 entschieden; V-AF-1 als Kandidat. |
| §7 (1) Laufzeit | TS |
| §7 (2) Ort | Client für AF1–AF3, Persistenz mit BA |
| §7 (4) Überflug-Definition | **10 min je Satellit** an einer Stelle (`fireEvents` + `fireClusters` teilen sie); sichtbare Änderung von `overpasses`/`eventLabel` wird im Gate ausgewiesen; F2 unberührt |
| §7 (5) Biomasse | **nicht** bauen |
| §7 (6) Tendenzen | beide behalten, getrennt beschriftet; V-AF-3 |
| §7 (7) Windflag | nur bei geladenem `fireWind`, Frame ±3 h, sonst `null` mit Grund |
| §7 (8) DWD-Bewölkung | **nein** — Beobachtungsqualität aus regionaler Aktivität, als grober Proxy beschriftet |
| §7 (9) Feature-Logger-Interim | **nein** — Merkmale werden mit dem BA-Batch persistiert (Schema + reine Funktion in AF3) |
| §7 (10) Prozessdateien | unverändert |
| §7 (11) FRE im UI | ja — nur im Detail, `null` = „nicht bestimmbar" |

**Konsequenz:** AF1 (Überflüge + Intensität), AF2 (Dynamik + Beobachtung) und AF3 (Merkmalsschema)
sind freigegeben und berühren **keine** STOPP-Zone; AF4 bleibt bis zur BA-Linie gesperrt. Kickoff für
AF1 kann aus §5 dieser Datei abgeleitet werden; Gate **GAF1** nach dem GBP1-Muster (§5, Verifikation).

---

## 11. Gate GAF1 — Umsetzung AF1 (2026-08-18)

**Was gebaut wurde (uncommitted, wie der Rest von `src/fire/`):**

| Baustein | Dateien | Verifikation |
|---|---|---|
| Überflüge (eine Regel: **10 min je Satellit**) | **neu** `src/fire/activity/overpasses.ts` (`FirePass`, `groupPasses`, `mergePasses`, `PASS_GAP_MS`) · `fireEvents.ts` (`overpasses` ⇐ `groupPasses`, vorher 1-Minuten-Slots) · `fireClusters.ts` (`passes: FirePass[]`, `overpasses` ⇐ `passes.length`, kein `byMinute` mehr) · `fireRegistry.ts` (`mergeClusters` ⇐ `mergePasses`) | `verify:fire-events` 42/42 (+1 Anker Minutengrenze) · `verify:fire-clusters` 105/105 (+2 Anker) · `verify:fire-registry` 74/74 |
| Intensität | **neu** `src/fire/activity/intensity.ts` (`frpLastPassMw`, `frpMaxPassMw`, `freMj` mit Gültigkeitsregel ≥ 3 Detektionen über ≥ 2 Überflüge, `freLabel`, `DAYNIGHT_LABEL`) | Selbstverifikation (bekanntes Trapez 144 000 MJ, `null` ≠ 0) |
| Aktivität am Record | **neu** `src/fire/activity/fireActivity.ts` (`FireActivity` inkl. AF2/AF4-Feldern = `null`, `activityOf`, `activitySummary`) · `fireRegistry.ts` (`FireRecord.activity: FireActivity \| null`, additiv; `null` bei reinen EFFIS-Einträgen) | `verify:fire-activity` **57/57** |
| Anzeige | `FireFootprintPanel.tsx` (Zeilen „FRP je Überflug", „FRE", „Überflüge"; Verlauf als vierspaltige Tabelle Zeit · Satellit ☀/☾ · Px · ΣFRP über die volle Kartenbreite) · `fireDeck.css` (zwei additive Regeln `.fire-fp-passes--af`, `.fire-fp-dd-wide`) | MCP Desktop 1440×900 + iPhone 12 Pro 390×844 |
| Verifier | **neu** `scripts/verify-fire-activity.mjs`, `package.json` `verify:fire-activity` | 57/57: (a) eine Überflug-Regel, (b) Namenskollision (`frpSumMw` = Fenstersumme 15, `frpLastPassMw` 5, `frpMaxPassMw` 10; FRE 81 000 MJ), (c) `activity` additiv/`null`, (d) Sprache (kein `Date.now()`, kein „Brandfläche"/„bestätigt", keine Biomasse), (perf) 6 000 Detektionen |

**Entscheidungen aus §10 umgesetzt:** TS-only · Client · Überflug 10 min je Satellit (sichtbare Änderung: `overpasses`/`eventLabel` zählen jetzt Überflüge statt Minuten — Live-Beispiel Amaro/Udine 5 Überflüge N/N20/N21/N/N20 in 2 h) · keine Biomasse · FRE nur im Detail mit `null`-Regel · AF2-Felder angelegt, nicht behauptet.

**Live-Befund (Prod-Preview, 2026-08-18, 24-h-Fenster, 63 Einträge):** Amaro (IT, EFFIS 327 ha, EMSR924): 17 Hotspots · 5 Überflüge · „28,3 MW zuletzt (max 53,3 MW)" · FRE 235,1 GJ über 2 h · nur Tagüberflüge · Pixelbreite 0,47 km. Einzelüberflug-Einträge zeigen FRE „nicht bestimmbar — n Detektionen über 1 Überflug mit FRP (nötig: mindestens 3 über 2)".

**Die fünf Selbstverifikationsfragen:**

| # | Frage | Beleg |
|---|---|---|
| 1 | **Funktionserhalt einzeln** | Alle 15 Fire-Verifier + `official-sources` grün (Liste oben, `verify:fire-model` 100, `-time` 75, `-sources` 151, `-firms` 86, `-corroboration` 82, `-danger-views` 44, `-behoerden` 97, `-boden` 52, `-zones` 52, `-footprint` 73). BC1-Liste (Sortierung nach `frpSumMw` unverändert Fenstersumme — Verifier-Anker (b)), Ortsfest-Einstufung F2 unberührt (`distinctDays`/`grew`, nicht `overpasses`), Panel-Zeilen von BP2 wortgleich, nur ergänzt. Einzige beabsichtigte sichtbare Änderung: Überflugzahlen (§10, Frage 4). |
| 2 | **Desktop pixelgleich** (Bestand) | Änderungen nur innerhalb der Detailkarte des Panels; `.fire-body`/`.fire-dock`/`.fire-readout` unangetastet; CSS nur additiv (zwei neue Regeln) — `audit/screenshots/aktivfeuer/desktop-1440-detail-af1.png`, `desktop-1440-verlauf-af1.png` |
| 3 | **Touch-Targets ≥ 44 px** | iPhone 12 Pro: alle Buttons der Detailkarte ≥ 44 px (`under44` nur der vorbestehende Inline-Textlink „Aktivierung öffnen" aus BP2, kein AF1-Element) — `mobile-390-detail-af1.png`; Überflug-Tabelle 298 px breit, einzeilig |
| 4 | **Konsole sauber** | Prod-Preview: keine neuen Fehler/Warnungen. Vorbestehend: 15× 404 (Baseline GBP1) und 3× MapLibre „Expected value to be of type number, but found null" — tritt mit `fireIndexNational` auf und ist unabhängig von AF1 (kein GeoJSON geändert); Hypothese `['match', ['get','level'] …]` bei DE-Stationen ohne Stufe ⇒ V-AF-6 |
| 5 | **Keine Long Tasks > 200 ms** (Prod-Build, `vite preview`, PerformanceObserver `longtask`) | Laden max **114 ms**; Zeile wählen + Fenster 24 h → 7 d (983 Einträge) max **141 ms** (GBP1: 130) · `npm run budget`: totalJs **900,1 KB** (Grenze 926,1; +2,1 KB gegen GBP1), eagerCss 8,5 KB (8,9), größter Chunk 278,4 KB — eingehalten |

**Offen / nächste Phase:** AF2 (`dynamics.ts` Tendenz + Ausbreitungsrichtung + Windflag, `observation.ts` Beobachtungsgelegenheit) nach §5; AF3 Merkmalsschema; AF4 gesperrt bis BA. V-Kandidaten §9 plus **V-AF-6** (MapLibre-Warnung `level` null bei DE-Stationen — vorbestehend, nicht AF1).

---

## 12. Gate GAF2 — Umsetzung AF2: Dynamik + Beobachtung (2026-08-18)

> Hinweis zur Session: die Umsetzung war bereits geschrieben, als die Sitzung versehentlich beendet
> wurde; der Verifier `scripts/verify-fire-activity.mjs` stand mit vier kaputten Regexen (unmaskierte
> `)`, `/` in Pfaden, `(hotspotRows)` als Gruppe) da. Nach dem Wiederaufsetzen: Verifier repariert,
> Long-Task-Regression gefunden und behoben (V-AF-7), FRE-Beschriftung bei Tageslücken geschärft.

**Was gebaut wurde (uncommitted, wie der Rest von `src/fire/`):**

| Baustein | Dateien | Verifikation |
|---|---|---|
| Tendenz (`state`) | **neu** `src/fire/activity/dynamics.ts` (`dynamicsOf`, `comparablePasses`, `extendsBeyond`; Regel: ΣFRP der letzten **3 Überflüge derselben Tageshälfte**, `growing` **nur** mit FRP-Anstieg > 30 % **und** Randwachstum > eine Pixelbreite (400 m) über die Bbox aller vorigen Überflüge hinaus — reiner FRP-Anstieg ⇒ `stable` mit Note „Blickwinkeleffekt möglich"; `declining` erst über zwei Rückgänge; `null` unter zwei vergleichbaren Überflügen mit Grund) | Selbstverifikation 19 Anker (u. a. Doppelbedingung, Tageshälfte, Einzelrückgang ≠ abklingend) |
| Ausbreitungsrichtung + Windflag | `dynamics.ts` (`bearingDeg`, `windAgreement`; FRP-gewichteter Schwerpunkt der früheren Überflüge → jüngster; ≥ 3 Überflüge mit FRP; erst ab halber Pixelbreite 200 m; Windflag `agree` ≤ 60°, `disagree` ≥ 120° gegen „wohin" = met. Richtung + 180°, dazwischen `null`) | Anker Nord/Ost/Süd/West, agree/disagree/null |
| Beobachtungsgelegenheit | **neu** `src/fire/activity/observation.ts` (`buildObservationIndex`, `observationFor`; 1°-Zellen, **je Zelle nach Überflug gruppiert**, globale Erst-/Letztzeit je Überflug; Umkreis 150 km; ein Überflug zählt erst, wenn seine früheste Detektion > 10 min nach der letzten Detektion des Brands liegt — der eigene letzte Überflug zählt nie als „späterer") | 11 Anker (u. a. eigener Überflug 4 min später zählt nicht, anderer Satellit 50 min später zählt) |
| Komposition | `fireActivity.ts` (`ActivityContext {noSignal, observation, windFromDeg}`; `state = 'no-signal'` aus dem Registry-Zustand, Note „vor dem Signalverlust …"; Beobachtung nur bei `no-signal`) · `fireRegistry.ts` (`RegistryInput.observationAt`/`windAt` optional; `windAt` mit `atMs` des jüngsten Überflugs) · `FirePage.tsx` (Beobachtungsindex memoisiert über `hotspotRows`; Wind nur, wenn `fireWind` geladen **und** Frame ±3 h um den Überflug, sonst `null`) | `verify:fire-activity` **102/102**; `verify:fire-registry` 74/74 |
| Wind-Sampler geteilt (V-AF-4) | **neu** `src/wind/windPointSample.ts` (`decodeImage`, `bilinear`, `sampleWindAt` mit `validAtMs`) · `src/qa/layerSampler.ts` re-exportiert statt zweiter Kopie | Verifier-Anker (f) |
| FRE-Ehrlichkeit bei Tageslücken | `intensity.ts` (`freMaxGapH` additiv; Label bei Lücke > 24 h: „größte Lücke N h — mehr als ein Tag ohne Beobachtung, das Trapez überbrückt ihn blind; sehr große Unsicherheit" statt „Lücken von Stunden") | 2 Anker |
| Anzeige | `FireFootprintPanel.tsx` — **Zeile:** Chip `fire-fp-trend is-*` (wachsend/stabil/abklingend, Tooltip = Begründung) bzw. bei `no-signal` `fire-fp-obs` („Sicht gegeben" / „nicht beobachtbar"); **Detail:** Zeilen „Tendenz" (mit Abgrenzung „nicht die Tendenz der Ereignis-Einordnung"), „Beobachtung" (nur bei kein Signal, mit voller Note), „Ausbreitung" (Kompass, Grad, Meter, Windflag-Text bzw. „kein Windabgleich (Windlayer aus oder kein Frame nahe genug)", Vorbehalt „Verschiebung des FRP-Schwerpunkts, kein Frontverlauf") · `fireDeck.css` 8 additive Regeln (`.fire-fp-trend`, `.fire-fp-obs`, `.fire-fp-wind`, Farben) | MCP Desktop 1440×900 + iPhone 12 Pro |

**Live-Befund (Prod-Preview `vite preview`, 2026-08-18 ~01:50 UTC, 7-Tage-Fenster, 983 Einträge):**
Baelen/Hohes Venn (EFFIS 2 825 ha, 1 531 Hotspots, 23 Überflüge): Zeile „abklingend"; Detail „ΣFRP fällt
über zwei Überflüge derselben Tageshälfte (−45 % zuletzt)", Ausbreitung „Schwerpunkt wandert nach SO
(156°, 3 429 m)", FRE 347,7 TJ über 73,1 h. Heiligengrabe (13 Hotspots, 2 Überflüge, 72 h auseinander):
Zeile „kein Signal seit 1 T 12 h · nicht beobachtbar", Detail „vor dem Signalverlust wachsend (+240 % …
und neue Detektionen am Rand)", Beobachtung „seit der letzten Detektion kein Überflug mit Detektionen im
Umkreis von 150 km — … keine Aussage über das Feuer", FRE „größte Lücke 72 h — mehr als ein Tag ohne
Beobachtung". Von 50 gezeigten Einträgen mit „kein Signal": 1 × „nicht beobachtbar", übrige „Sicht gegeben".
Windflag: mit geladenem `fireWind` (Lauf 21z) bleibt es bei allen Einträgen ehrlich `null` — der jüngste
Überflug (15:06 UTC) liegt 6 h vor dem ersten Frame; das Panel sagt „kein Frame nahe genug".

**V-AF-7 (gefunden und behoben):** die erste Fassung von `observationFor` scannte je Eintrag ±3°/±6°
Zellen (91 statt 35 für 150 km) und jede Zeile einzeln — beim Wechsel 24 h → 7 Tage (983 Einträge,
~900 davon ohne Signal, 7 192 Zeilen) **418 ms und 386 ms** Long Tasks am Prod-Build (GAF1: 141 ms).
Nach der Umstellung (Zellspanne aus Radius und Breitengrad, je Zelle nach Überflug gruppiert, gesehener
oder zu früher Überflug ohne Zeilenscan übersprungen, Bbox-Vorprüfung vor der Distanz): **max 126 ms**;
Verifier-Mengengerüst 1 000 Abfragen gegen 6 000 Zeilen **350 ms → 14 ms** bei identischen Ergebnissen.
Lehre: eine „nur bei kein Signal"-Abfrage ist im 7-Tage-Fenster die **Regel** (≈ 90 % der Einträge), nicht
die Ausnahme — Kosten am Prod-Build messen, nicht schätzen.

**Die fünf Selbstverifikationsfragen:**

| # | Frage | Beleg |
|---|---|---|
| 1 | **Funktionserhalt einzeln** | Alle 14 Fire-Verifier + `official-sources` grün (`fire-model` 100, `-time` 75, `-sources` 151, `-firms` 86, `-events` 42, `-corroboration` 82, `-danger-views` 44, `-behoerden` 97, `-boden` 52, `-zones` 52, `-clusters` 105, `-footprint` 73, `-registry` 74, `-activity` 102; `official-sources` 44). `typecheck` grün. AF1-Zeilen wortgleich; BP2-Zeilen unverändert; `FireEvent.trend` unberührt (getrennt beschriftet, V-AF-3). Registry-Aufrufer ohne `observationAt`/`windAt` erhalten unverändert `observation: null`, `windAgreement: null` (Verifier-Anker (f)). |
| 2 | **Desktop pixelgleich** (Bestand) | Änderungen nur innerhalb Panelzeile (ein zusätzlicher Chip in `.fire-fprow-meta`) und Detailkarte; CSS additiv (8 Regeln, keine bestehende Regel geändert) — `audit/screenshots/aktivfeuer/desktop-1440-detail-af2.png`, `desktop-1440-beobachtung-af2.png` |
| 3 | **Touch-Targets ≥ 44 px** | iPhone 12 Pro 390×844 DPR 3: Detailkarte `under44 = []`; Verlaufstabelle 298 px breit ohne Overflow; Chips sind Text, keine Ziele — `mobile-390-detail-af2.png` |
| 4 | **Konsole sauber** | Prod-Preview: nur Baseline 15× 404 (GBP1). Die MapLibre-Warnung „Expected value to be of type number, but found null" (3×) erscheint **nur mit `fireWind`** — ohne Wind (nur `fireFootprints`) ist die Konsole frei davon ⇒ **V-AF-6 korrigiert:** vorbestehend aus dem Windlayer WW1, nicht aus `fireIndexNational`, nicht aus AF1/AF2. |
| 5 | **Keine Long Tasks > 200 ms** (Prod-Build, PerformanceObserver `longtask`) | Kaltstart 24 h ohne Wind max **74 ms** (GAF1: 114); Wechsel 24 h → 7 Tage max **126 ms** (GAF1: 141; vor V-AF-7: 418); Zeile wählen 61 ms. Kaltstart 7 Tage **mit** Windlayer zeigt 250–530 ms — das ist der GRIB-Decode/Textur-Aufbau des Windlayers (WW1, 1:1 aus der Wetterkarte), unabhängig von AF2 (gleiche Größenordnung ohne Fire-Panel). `npm run budget`: totalJs **904,0 KB** (Grenze 926,1; +3,9 KB gegen GAF1), eagerCss 8,5, größter Chunk 278,4 — eingehalten. |

**Bewusste Grenzen (stehen im Produkt):** Beobachtung ist ein grober Proxy (regionale ≠ lokale Sicht,
Überflüge nur über ihre Detektionen bekannt, DACH-Rand beschneidet den Umkreis) — jede Note sagt es;
Windabgleich ist Vorhersage des aktuellen Laufs, kein Rückblick — bei > 3 h Abstand kein Flag; Tendenz
aus zwei Überflügen ist die Untergrenze der Regel (Konzept §5.5) und wird als solche beschriftet
(„vor dem Signalverlust", Note mit Prozent und Randwachstum).

**Offen / nächste Phase:** AF3 (`features.ts` Merkmalsschema versioniert, Paritäts-Verifier, Persistenz-
Haken benannt, Schema-Doku unter `docs/`); AF4 gesperrt bis BA. V-Kandidaten §9 plus V-AF-6 (korrigiert:
Windlayer) und **V-AF-8**: Windflag-Grund unterscheiden („Windlayer aus" vs. „kein Frame nahe genug") —
Mehrwert: der Leser weiß, ob Einschalten des Windlayers hilft; Skizze: `windAt` liefert `{deg, reason}`
statt `number | null`, Panel nennt den Grund.

---

## 13. AF3 — Merkmalsschema: Diagnose und Plan (2026-08-18)

**Warum jetzt (Konzept §12, Audit §3 F):** die FIRMS-Detektionen eines Ereignisses sind für den Client
nach ≤ 7 Tagen weg; die BA-Kartierung kommt später. Wer die Merkmale nicht **vor** Ablauf des Fensters
festhält, hat zum Labelzeitpunkt nichts. AF3 baut deshalb die **reine Funktion**, die aus einem
`FireRecord` den versionierten Merkmalsatz rechnet — im Client sichtbar (prüfbar ab Tag 1) und für den
späteren BA-Batch **dieselbe Datei** (Node strip-types ⇒ Parität per Konstruktion). Persistenz wird
**benannt, nicht betrieben** (Jan §10, Frage 9).

**Was am Record vorhanden ist (Stand GAF2) und was daraus Merkmal wird:**

| Konzept §6 | Merkmal (`FireFeatures`) | Quelle am Record | Anmerkung |
|---|---|---|---|
| `n_detections` | `nDetections` | `hotspots` | |
| `n_overpasses` | `nOverpasses` | `overpasses` (= `activity.passCount`, 10 min je Satellit) | |
| `frp_sum_max_mw` | `frpMaxPassMw` | `activity.frpMaxPassMw` | Überflugsumme, **nicht** `frpSumMw` (Fenstersumme — steht zusätzlich als `frpSumWindowMw`) |
| `fre_mj` | `freMj` | `activity.freMj` | `null` = nicht bestimmbar (Gültigkeitsregel); dazu `freSpanH`, `freMaxGapH` |
| `duration_h` | `durationH` | `(lastMs − firstMs)/3,6e6` | innerhalb des Fensters |
| `envelope_area_ha` | `coverageHa` + `coverageCapped` | Σ `sources.zones[].areaHa` (Detektionsraster) | bewusst **nicht** `areaHa` des Records (bei EFFIS-Einträgen wäre das die Kartierung); Wortwahl S4/V-AF-1 |
| — | `hullKm2` | `sources.cluster.hullKm2` | BP1-Größe, billig |
| `sensor_family` | `sensorFamily` | konstant `'VIIRS'` (nur VIIRS ingestiert, §8 Nr. 9) | |
| `daynight_mix` | `daynightMix` | `activity.daynightMix` | |
| — | `meanScanKm` | `activity.meanScanKm` | Off-Nadir-Kennzeichnung |
| `landcover_dominant` | `landcoverDominant` | `landcover[0].key` — **nur** mit EFFIS-Kartierung | CLC-Maske im Repo kennt nur industrial/other ⇒ sonst `null`, ehrlich |
| `month` | `month` | UTC-Monat von `firstMs` | |
| — | `country`, `confidenceFirms` (Anteil high/nominal/low), `assessment`, `suspectedStatic`, `activityState` | BP1/AF2 | Kovariaten und Ausschlusskriterien (ortsfest ⇒ kein Paar) |
| — | `effisMappedHa` | `areaHa.value` wenn `kind = 'mapped'` | **Referenz, kein Ziel** — das Konzept-Ziel ist die BA-Nettofläche mit `separability`; ob EFFIS-RDA-Paare als Interimslabel taugen, ist eine offene Produktfrage (V-AF-9) |
| Ziel (`target`) | `FireLabelTarget` | **nicht im Client** — kommt vom BA-Batch | `{ areaNetHa, areaMinHa, areaMaxHa, baStatus, separability, mappedAtMs }`; Aufnahmeregel `baStatus ∈ {mapped, final}` ∧ `separability ≥ 1,5` als reine Funktion `isEligiblePair` |

**Schema-Regeln:** `featureVersion: 1` in jedem Satz; **kein** `undefined`, jede Lücke ist `null` mit
Grund im Schema-Dokument; keine Fläche, die als Brandfläche gelesen werden könnte, ohne ihre Art;
Kennung `id = fire:<anchorKey>` (sitzungsstabil, **nicht** sitzungsübergreifend — BP0 §7 b bleibt offen,
der Batch vergibt seine eigene); Merkmale sind **deterministisch** aus dem Record (Verifier: zweimal
rechnen ⇒ byte-gleiches JSON; kein `Date.now()`, `asOfMs` wird hereingereicht).

**Persistenz-Haken (benannt):** der BA-Watchlist-Eintrag (`konzept-brandflaechen-modul.md` §3) bekommt
ein Feld `features: FireFeatures` — geschrieben beim Trigger (`fire_out`), **eingefroren bei
`t_end + 7 d`** (danach fällt die letzte Detektion aus dem FIRMS-Fenster; der Satz kann sich nicht mehr
ändern). Ziel wird beim Übergang nach `mapped`/`final` ergänzt ⇒ `FireLabelPair`. Modelldatei
`public/fire/af/area-estimate-v{n}.json` (AF4). Nichts davon läuft heute — kein Cron, kein Speicher.

**Anzeige:** Detailkarte bekommt eine Zeile „Merkmale (v1)" mit den Kernwerten und einem
„JSON kopieren"-Knopf (≥ 44 px), damit ein Satz ab Tag 1 von Hand geprüft und weitergegeben werden kann.

**Verifier (Erweiterung `verify:fire-activity`, Abschnitt (g)):** Schema vollständig (jeder Schlüssel
gesetzt, `undefined` verboten), Determinismus (byte-gleich), Version, EFFIS-Eintrag ohne Detektion ⇒
`nDetections null`, `coverageHa` ≠ `effisMappedHa`, `isEligiblePair`-Regel (provisional raus,
separability < 1,5 raus), Sprache (kein „Brandfläche" für `coverageHa`).

**Aufwand:** ≈ 0,5 Sitzung. Kein STOPP-Trigger (rein additiv, kein Cron, keine Edge Function).

---

## 14. Gate GAF3 — Umsetzung AF3: Merkmalsschema (2026-08-18)

**Was gebaut wurde (uncommitted, wie der Rest von `src/fire/`):**

| Baustein | Dateien | Verifikation |
|---|---|---|
| Schema + Referenzfunktion | **neu** `src/fire/activity/features.ts`: `FEATURE_VERSION = 1`, `FireFeatures` (28 Schlüssel, `FEATURE_KEYS` in fester Reihenfolge), `featuresOf(record, asOfMs)` (pur, deterministisch, kein `Date.now()`), `featuresJson` (byte-gleich), `featuresSummary` (Kurzform fürs Panel), `FireLabelTarget`/`FireLabelPair`, `isEligiblePair` (mapped/final ∧ Trennbarkeit ≥ 1,5 ∧ nicht ortsfest), Konstanten `MIN_PAIRS_FOR_FIT = 25`, `INTERVAL_LEVEL = 0,8`, `MIN_SEPARABILITY = 1,5` | Selbstverifikation 12 Anker; `verify:fire-activity` (g) 11 Anker mit **echten** Registry-Records: Vollständigkeit (kein `undefined`), Determinismus, Werte aus dem Record (3 Det./2 Überflüge/max ΣFRP 10 ≠ Fenstersumme 15/FRE 81 000/Dauer 3 h/Monat 8/VIIRS), Abdeckung ≠ EFFIS-Referenz, reiner EFFIS-Eintrag ⇒ Prädiktoren `null`, Paarregel, Sprache, Panel, Schema-Doku — **124/124** |
| Schema-Dokument | **neu** `docs/aktivfeuer-merkmale.md` (Zweck, 6 Regeln, Feldtabelle mit Herkunft und `null`-Bedeutung, Labelpaar + Persistenz-Haken, Beispiel aus dem Verifier-Fixture, Versionstabelle) | Verifier prüft Existenz, Version, `t_end + 7 d`, `isEligiblePair` |
| Anzeige | `FireFootprintPanel.tsx` (`FeaturesRow`: Zeile „Merkmale" mit 11 Kernwerten, Knopf „JSON kopieren" → `kopiert ✓`, Fußnote „heute ohne Speicher, gilt nur innerhalb des Fensters") · `fireDeck.css` (5 additive Regeln `.fire-fp-features*`, einspaltig — zweispaltig brach im 250-px-Panel Wörter) | MCP Desktop + iPhone 12 Pro; Kopierpfad mit gestubbtem `writeText` geprüft: 28 Schlüssel, Version 1 |
| Persistenz-Haken **benannt** | `features.ts` (Kommentar + Typen), `docs/aktivfeuer-merkmale.md` §4: Watchlist-Feld `features`, eingefroren bei `t_end + 7 d`, `target` beim Übergang nach `mapped`/`final`, Modelldatei `public/fire/af/area-estimate-v{n}.json` | — (nicht betrieben: kein Cron, kein Speicher, keine Datei) |
| Messhygiene (V-AF-10) | `fireRegistry.ts` Selbstverifikation: Bulk-Anker „< 150 ms" misst jetzt den **besten von drei Läufen** — die Schwelle bleibt | vorher 82…241 ms Streuung (JIT/GC/Chrome-Last), jetzt 87…112 ms |

**Live-Befund (Prod-Preview, 2026-08-18 ~17:30 UTC, 7-Tage-Fenster, 958 Einträge):** Baelen/Hohes Venn:
Detektionen 1 531 · Überflüge 23 · max ΣFRP/Überflug 5 392,1 MW · FRE 347 652,6 GJ · Dauer 73,1 h ·
Abdeckung 5 849 ha (Raster, keine Brandfläche) · Hülle 68,14 km² · Tag/Nacht DN · Landbedeckung „andere
natürliche Flächen" · Monat 8 · EFFIS-Referenz 2 825 ha kartiert (Referenz, kein Ziel). Bemerkenswert:
über 7 Tage und 23 Überflüge liegt das Raster hier bei **2,1× EFFIS** — das Gegenteil des BF0-Befunds
(0,5–0,6× bei den größten Paaren, damals 24-h-Fenster) ⇒ `coverageHa` ist fensterabhängig, ein Grund
mehr, warum das Schema `durationH`/`nOverpasses` mitführt und ein Labelpaar erst bei `t_end + 7 d` gilt.

**Die fünf Selbstverifikationsfragen:**

| # | Frage | Beleg |
|---|---|---|
| 1 | **Funktionserhalt einzeln** | Alle 14 Fire-Verifier + `official-sources` grün (`fire-model` 100, `-time` 75, `-sources` 151, `-firms` 86, `-events` 42, `-corroboration` 82, `-danger-views` 44, `-behoerden` 97, `-boden` 52, `-zones` 52, `-clusters` 105, `-footprint` 73, `-registry` 74, `-activity` 124; `official-sources` 44). `typecheck` grün. Registry, Layer, Karte unverändert (features.ts liest nur; `FireRecord` bekommt **kein** neues Feld). Der F1-Anker „aus frp wird nie eine Fläche abgeleitet" hat den ersten Fußnotentext („FRP → Fläche") gestoppt — umformuliert; der Anker bleibt. |
| 2 | **Desktop pixelgleich** (Bestand) | Nur eine zusätzliche `<dt>`-Zeile in der Detailkarte, CSS additiv — `audit/screenshots/aktivfeuer/desktop-1440-merkmale-af3.png` |
| 3 | **Touch-Targets ≥ 44 px** | iPhone 12 Pro: `under44 = []`, Kopierknopf 95 × 44 px im Sheet (`.fire-fp-inline-btn`-Regel von BP2) — `mobile-390-merkmale-af3.png` |
| 4 | **Konsole sauber** | Prod-Preview ohne Wind: nur Baseline 404 (GBP1); keine neuen Meldungen |
| 5 | **Keine Long Tasks > 200 ms** (Prod-Build) | Zeile wählen mit Merkmalszeile 118–121 ms (7 Tage, 958 Einträge; enthält Detailkarte + Karte-Fokus), Kaltstart wie GAF2. `npm run budget`: totalJs **905,4 KB** (Grenze 926,1; +1,4 KB gegen GAF2), eagerCss 8,5, größter Chunk 278,4 — eingehalten. |

**V-Kandidaten aus AF3:** **V-AF-9** EFFIS-RDA-Kartierungen als Interimslabel (Produktfrage, s. Doku §4);
**V-AF-10** erledigt (Bulk-Anker bester von 3); **V-AF-11** `FeaturesRow` könnte den Satz zusätzlich als
Download anbieten — nicht gebaut, weil ohne Persistenz-Entscheidung jede Datei „Speicher" suggeriert.

**Offen / nächste Phase:** **AF4 bleibt gesperrt** bis die BA-Linie läuft und ≥ 25 Paare vorliegen
(Jan §10). Die Aktiv-Feuer-Linie AF1–AF3 ist damit **abgeschlossen**; was jetzt fehlt, ist die
Entscheidung über die Sentinel-2-Batch-Linie (Cron, Speicherweg, Toolchain — STOPP & FRAGEN seit BP0),
an der Labelpaare, Persistenz und Kalibrierung hängen.

---

## 15. AF4 — Kalibrierung aus Archivdaten: Entscheidung, Umsetzung, Gate GAF4 (2026-08-18)

**Entscheidung Jans (2026-08-18):** nicht bis 2027 auf Labelpaare aus der (nicht gestarteten) Sentinel-2-
Batch-Linie warten, sondern das Modell **jetzt aus dem Archiv** bauen — EFFIS-RDA-Kartierungen als Ziel
(V-AF-9 damit entschieden), FIRMS-Standard-Processing als Merkmalsquelle; Schlüssel als lokale Datei
(`.cache/firms-archive/mapkey.txt`, gitignored); Anzeige **sichtbar mit Kill-Switch**. Der Prod-Proxy
`/_firms` (NRT-Whitelist) blieb unangetastet, kein Cron, keine Edge Function ⇒ kein STOPP-Trigger.
Grundlage: `audit/waldbrand-effis.md` §5.3 — seit 2020/21 kartiert EFFIS Sentinel-2-gestützt bis
0–2 ha (861 Polygone DACH 2020–2025), also dieselbe Modalität wie das geplante BA-Modul; die
„≥ 30 ha"-Sorge galt nur der MODIS-Ära.

**Was gebaut wurde (uncommitted; Daten- und Modelldatei unter `public/fire/af/`):**

| Baustein | Dateien | Verifikation |
|---|---|---|
| Schema (nur Ziel) | `features.ts`: `FireLabelTarget.source: 'ba-dnbr' \| 'effis-rda'`, `separability: number \| null`, `effisId?`; `isEligiblePair` je Quelle (`effis-rda`: mapped/final ∧ Fläche > 0 ∧ ≥ 1 Detektion ∧ nicht ARTIFSURF ∧ nicht ortsfest); `featureVersion` bleibt 1 | 7 neue Anker |
| Mathematik | **neu** `src/fire/activity/calibration.ts`: log-log-OLS, Student-t (Betafunktion + Bisektion, gegen Tabellenwerte geprüft), 80-%-**Prädiktionsintervall**, Leave-one-out (RMSE ln, Abdeckung), Prädiktorbereich, `round3s`; kein Fit < 25 Paare | 12 Anker (synthetische Steigung 0,8 wiedergefunden, LOO-Abdeckung 80,5 %) |
| Schätzung | **neu** `src/fire/activity/estimate.ts`: `estimateArea` (Modellwahl nach kleinerer LOO-Streuung; außerhalb Bereich ⇒ `null` „keine Extrapolation"; ortsfest/ohne Detektion/fremde Version ⇒ `null` mit Grund), `estimateLabel` (Punktwert nie ohne Intervall), `loadAreaModel` (statisch `/fire/af/area-estimate-v1.json`), `areaEstEnabled` (`?afEst=0` / `localStorage.afEst='0'`) | 12 Anker |
| Archiv-Paare | **neu** `scripts/fire/pairs-from-archive.mjs` (`npm run fire:pairs-archive`): je Jahr EFFIS `ms:modis.ba.poly.{Y}` (DACH, kein Kleindeckel, Achsen-Anker) × FIRMS `VIIRS_SNPP_SP`/`VIIRS_NOAA20_SP` (5-Tage-Chunks Mär–Okt, `type ≠ 0` verworfen, Cache) → je Kartierung **dieselben** Module wie der Client (Cluster → Zonen → Abgleich → Registry → `featuresOf`) → `FireLabelPair`; `--dry-run` netzfrei | Verifier (h): Dry-Run ⇒ 1 Paar |
| Modell | **neu** `scripts/fire/calibrate.mjs` (`npm run fire:calibrate`): `isEligiblePair` → zwei Fits → `area-estimate-v1.json` mit Caveats | Verifier (h): synthetisch b ≈ 0,8; < 25 ⇒ Exit ≠ 0; Repo-Modell v1/n ≥ 25 |
| Client | `FirePage.tsx` (Modell lazy, nur mit `areaEstEnabled()`; `RegistryInput.estimateFor`), `fireRegistry.ts` (`estimateFor` nach dem Bau, additiv), `fireActivity.ts` (`areaEst: AreaEstimate \| null`, `areaEstReason`), `FireFootprintPanel.tsx` (Zeile „Schätzung": „Fläche ≈ X ha (Y–Z ha, 80 %) — Modell v1, EFFIS-kalibriert (n Paare 2020–2025), aus …; kein Ersatz für eine Kartierung", bei Kartierung „zum Vergleich kartiert: A ha (die Kartierung gilt)", bei Raster „das Raster oben ist die Abdeckung, nicht die Fläche") | `verify:fire-activity` **162/162**, `verify:fire-registry` 74/74, `verify:fire-firms` 86/86 |
| Doku | `docs/aktivfeuer-merkmale.md` §4 (zwei Labelquellen), §7 (Kalibrierung, Modellwahl, Bias, Datenweg, Kill-Switch); `architecture.md` §14.8; CLAUDE.md-Landkarte; `.gitignore` `.cache/` | — |

**Datenlauf (2026-08-18, einmalig, lokal):** Verfügbarkeit SNPP-SP 2012-01-20…2026-04-27,
NOAA-20-SP 2018-04-01…2026-05-31 · 495 Abfragen (+100 aus dem Cache der 2025-Probe, 0 Retries) ·
66 640 VIIRS-Zeilen (nach `type ≠ 0`: **206 252 verworfen** — ortsfeste Quellen sind im Archiv die
Mehrheit) · Paare je Jahr: 2020 34/48 Kartierungen · 2021 45/54 · 2022 174/239 · 2023 59/71 ·
2024 57/73 · 2025 162/376 ⇒ **531 Paare, 519 zulässig**; „ohne Detektion" 155, „ohne Zuordnung" 175
(Detektionen im Umkreis, aber kein Registry-Treffer — konservativ). Verteilung: Fläche Median 8 ha
(q10 1, q90 85, max 3 988 Karst 2022), Detektionen Median 4 (q90 21, max 462), FRE bei 324 Paaren.
Landbedeckung: 335 OTHERNATLC, 60 CONIFER, 47 BROADLEA, 30 TRANSIT, 25 MIXED, 11 AGRIAREAS, 1 ARTIFSURF.

**Modell v1 (`public/fire/af/area-estimate-v1.json`, `trainedAt` 2026-08-19, Jahre 2020–2026):**

| Modell | n | Grad | β | R² | σ (ln) | Bereich | LOO-RMSE (ln) | LOO-Abdeckung 80 % |
|---|---|---|---|---|---|---|---|---|
| **det** `ln area ~ ln nDetections` | 604 | 2 | [1,476 · 0,373 · 0,102] | 0,31 | 1,329 | 1…462 | 1,332 | 78,8 % |
| **fre** `ln area ~ ln freMj` | 368 | 1 | [−1,150 · 0,298] | 0,17 | 1,486 | 2 208…1,39·10⁸ MJ | 1,491 | 77,4 % |

**Vier Befunde aus der Modellarbeit (alle gemessen, nicht angenommen):**

1. **Detektionen schlagen FRE** — das Konzept hatte FRE vorn. Geprüft und verworfen wurden außerdem
   `coverageHa` (LOO 1,37), `hullKm2` (1,48), `frpMaxPassMw` (1,42), `frpSumWindowMw` (1,39),
   `durationH` (1,55), `nOverpasses` (1,41). Auch **multiple Regression bringt nichts**
   (`nDetections + coverageHa`: 1,349; mit FRE und Dauer nicht besser) — die Prädiktoren messen
   dasselbe. `estimateArea` wählt deshalb nach gemessener LOO-Streuung, nicht nach Vorannahme.
2. **Die Gerade war zu flach für große Brände.** Residuen nach *Prädiktorklasse* (nicht nach Zielgröße —
   das erzeugt sonst den Regressionseffekt): ab 41 Detektionen mittleres ln-Residuum +0,59, über 100 sogar
   +1,23 (Unterschätzung um Faktor 3,4), Intervall-Abdeckung dort 67 % statt 80 %. Das quadratische Glied
   ist signifikant (t = 3,5, F = 12,1 bei (1, 601) df) und beseitigt den Bias (+0,27 / +0,29). Der Grad
   wird deshalb per t-Test entschieden — eine erste Heuristik („LOO ≥ 1 % besser") war willkürlich und
   hätte die reale Krümmung bei 0,89 % Gewinn verworfen.
3. **Monotonie ist eine fachliche Nebenbedingung.** Am FRE-Modell war Grad 2 statistisch minimal besser,
   fiel aber zwischen 2 208 und 63 000 MJ (β₁ = −1,80) — „mehr Strahlungsenergie, kleinere Fläche".
   `isMonotoneIncreasing` verwirft solche Fits; dort bleibt es bei der Geraden.
4. **Die Streuung bleibt groß** (σ 1,33 ln ⇒ Intervall ×/÷ 5,6; R² 0,31) und ist heteroskedastisch
   (σ 1,22 bei ≤ 4 Detektionen, 1,48 darüber) — nicht wegmodelliert, sondern im Intervall und im Text
   ausgewiesen. Bekannte Restschwäche: die Klasse 16–40 Detektionen deckt nur 66–68 %.

**Ablage (2026-08-19):** Trainingsdaten (Paare, Reports, Ausschlusslisten) liegen unter
`data/fire/af/` — im öffentlichen Repo nachvollziehbar, aber **nicht im Deploy**, weil der Client sie nie
lädt; ausgeliefert wird allein `public/fire/af/area-estimate-v1.json` (2,5 KB). Dieselbe Achse gilt später
für die BA-Linie: Polygone, die die Karte zeichnet, nach `public/`, Zwischenstände und Trainingsdaten nach
`data/`.

**V-AF-13 geprüft (Ausschlüsse, `*.dropped.json`):** von 861 + 308 Kartierungen wurden 330 (2020–2025)
bzw. 221 (2026) kein Paar. Der Ausschluss ist **größenabhängig**: 0–2 ha 48 % verworfen, 2–10 ha 39 %,
10–50 ha 36 %, 50–200 ha 32 %, > 200 ha 25 %. Grund je Hälfte: „ohne Detektion" (155) — VIIRS sah den
Brand nicht — und „ohne Zuordnung" (175, Median 4 ha, Median 2 Zeilen im Fenster): Detektionen lagen im
Umkreis, aber die Registry ordnete sie der Kartierung nicht zu (Zone/Polygon außerhalb der Toleranz).
**Bewusst nicht gelockert:** die Zuordnung ist exakt die des Clients — eine großzügigere Batch-Regel
würde auf Paaren trainieren, die im Betrieb nie entstehen. Konsequenz für die Lesart: das Modell gilt für
**detektierte und zugeordnete** Brände; kleine Brände sind im Training unterrepräsentiert.

**Live-Plausibilität (Prod-Preview, 7-Tage-Fenster; außerhalb des Trainings):**
Amaro/Udine (203 Detektionen) ⇒ „Fläche ≈ 563 ha (97–3 290 ha, 80 %) … zum Vergleich kartiert: 327 ha
(die Kartierung gilt)" — Kartierung im Intervall; der Datenmedian dieser Prädiktorklasse ist 616 ha, die
Schätzung also datengetreu (mit dem alten linearen Modell waren es 196 ha) · Gumtow (15 Detektionen,
Raster „bis 174 ha") ⇒ „≈ 27 ha (4,8–153 ha)" · Duisburg (ortsfest) ⇒ „— überwiegend ortsfeste
Detektionen — keine Brandfläche zu schätzen" · Baelen (1 531 Detektionen > 462) ⇒ „— außerhalb des
Kalibrierbereichs … keine Extrapolation". Kill-Switch `?afEst=0`: keine Zeile, kein Modellabruf.

**Auslieferung (Befund im Betrieb):** `public/sw.js` führt **jede** `.json` als „gehashtes Asset"
(stale-while-revalidate) — die Modelldatei ist aber nicht gehasht. Der Loader holt sie deshalb mit
`cache: 'no-store'` (dasselbe Muster wie die Warm-Cron-Manifeste, `iconD2WindSource.ts`; dort ist der
Effekt bereits kommentiert und gewollt). Zusätzliche Regel: **jede veröffentlichte Neukalibrierung erhöht
die Modellversion** (`area-estimate-v{n}.json`), sonst sehen wiederkehrende Besucher stillschweigend die
alten Koeffizienten. (Beim Live-Test lieferte der SW hartnäckig das vorige Modell — genau dieser Fall.)

**Die fünf Selbstverifikationsfragen:**

| # | Frage | Beleg |
|---|---|---|
| 1 | **Funktionserhalt einzeln** | Alle Fire-Verifier grün (`-activity` 162, `-registry` 74, `-firms` 86, `-footprint` 73; übrige unverändert seit GAF3). Ohne Modell/mit Kill-Switch ist der Zustand byte-gleich zu GAF3 (`areaEst: null`, keine Zeile). Registry-Vertrag additiv (`estimateFor` optional). |
| 2 | **Desktop pixelgleich** (Bestand) | Eine zusätzliche `<dt>`-Zeile „Schätzung" (das längere „Flächenschätzung" lief in die Wertspalte — gekürzt), keine CSS-Änderung — `audit/screenshots/aktivfeuer/desktop-1440-schaetzung-af4.png` |
| 3 | **Touch-Targets ≥ 44 px** | iPhone 12 Pro: `under44` nur der vorbestehende BP2-Textlink „Aktivierung öffnen" — `mobile-390-schaetzung-af4.png` |
| 4 | **Konsole sauber** | Baseline 404 (GBP1). Die MapLibre-Warnung „type number, found null" (3×) erschien diesmal **ohne** Windlayer bei Zoom auf Friaul ⇒ **V-AF-6 präzisiert:** viewport-abhängig aus dem Basemap-Stil (OpenFreeMap), nicht aus Fire-Layern; vorbestehend. |
| 5 | **Keine Long Tasks > 200 ms** (Prod-Build) | Zeile wählen mit Schätzung 103–191 ms (7 Tage, ~960 Einträge, Detail + Karten-Fokus); Modelldatei 2,5 KB, ein Abruf je Sitzung. `npm run budget`: totalJs **906,8 KB** (Grenze 926,1; +1,4 KB gegen GAF3), eagerCss 8,5, größter Chunk 278,4. |

**Fallen aus AF4:** (1) das Bash-Tool verdoppelt Backslashes in Heredocs nicht sauber — Patch-Skripte mit
Escapes über das Write-Tool anlegen; (2) `npm run … -- --flag` reicht unter `npm.ps1` Argumente nicht
zuverlässig weiter — Skripte direkt mit `node` aufrufen (im Kopf dokumentiert); (3) EFFIS-`LASTUPDATE`
ist die Nachprozessierung, nicht das Brandjahr — Trainingsjahre aus `asOfMs`; (4) BP1-Perf-Anker
(< 150 ms) flackert bei offenem MapLibre-Tab (134…203 ms) — vor Perf-Verifiern den Tab schließen.

**Nachtrag 2026-08-19 (Saison 2026 nachgezogen):** `--years 2026` nutzt den Saison-Layer
`ms:modis.ba.poly.season` (Jahreslayer gibt es erst für abgeschlossene Jahre) mit jahresscharfem Filter
und eigenem Cache-Namen je Abrufdatum; FIRMS-SP reicht bis 2026-04-27 (SNPP) / 2026-05-31 (NOAA-20),
deshalb 175 Kartierungen „ohne Detektion". Ergebnis: +87 Paare (85 zulässig), Gesamtmodell 604.

**Offen / V-Kandidaten:** **V-AF-12** `country` bleibt im Archivskript `null` (kein Umriss-Callback im
Batch — für das Modell unerheblich, für Auswertungen je Land nachziehen); **V-AF-13** „ohne Zuordnung" 175
(Detektionen im Umkreis, kein Registry-Treffer) systematisch prüfen — Zeitfenster ±14 d/Bbox+3 km sind
konservativ, ein Teil davon wären zusätzliche Paare; **V-AF-14** Modell v2 aus der BA-Linie (eigene dNBR-
Labels mit Trennbarkeit) — Schema und Rechenweg sind vorbereitet, `labelSource` trennt die Modelle;
**V-AF-15** Modell jährlich nachziehen (`fire:pairs-archive --years 2026`, sobald SP für die Saison da ist,
+ `fire:calibrate`), Version hochzählen. Ergebnis: **Die Aktiv-Feuer-Linie AF1–AF4 ist umgesetzt** —
Modell v1 EFFIS-kalibriert, einschaltfertig, sichtbar; die BA-Linie ist jetzt Verfeinerung, kein Blocker.
