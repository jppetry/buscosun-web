# Thermalanomalien — Vegetationsbrände vs. persistente Anlagen-Signaturen (TA0–TA5)

> Stand 2026-08-22. Diagnose **TA0** (§1–§5), Entscheidungsprotokoll §6 (Defaults, bis Jan anders entscheidet),
> Umsetzung TA1–TA5 und Gate-Belege werden in §7 ff. nachgetragen.
> Auftrag (Jan, 2026-08-22): Hotspots in echte Vegetationsbrände und persistente Thermalanomalien aus
> Industrie-/Anlagenbetrieb trennen; eigener Reiter „Thermalanomalien" neben „Brände" und „Layer";
> nur offene Daten mit Kommerz-Erlaubnis; kein Backend; **False Negatives sind das kritische Risiko**.

## 1. Befund am Archiv (gemessen)

Grundlage: `.cache/firms-archive/` (AF4, gitignored) — 619 VIIRS-SP-Chunks SNPP + NOAA-20, 2020-03 … 2026-05,
nur März–Oktober, DACH-Box 5,5–17,5 / 45,5–55,5, **289 992 Zeilen**. Das SP-Archiv trägt das Feld `type`
(0 = vermuteter Vegetationsbrand, 1 = Vulkan, 2 = sonstige statische Landquelle, 3 = offshore), das im
NRT-Feed fehlt (`fireEvents.ts:16-23`).

| `type` | Detektionen | Anteil | nachts |
|---|---|---|---|
| 0 vegetation | 72 792 | 25,2 % | 35 % |
| 2 static | **211 840** | **73,2 %** | 84 % |
| 3 offshore | 4 745 | 1,6 % | 99 % |

- **Nur 362 Zellen** (0,01°) tragen `type 2`. Top-Zellen (Detektionen · verschiedene Tage): 48,28/14,34
  **voestalpine Linz** 7 662 · 1 220; 51,37/6,71 **HKM Duisburg** 6 974 · 1 214; 52,15/10,40 **Salzgitter**
  6 823 · 1 221; 51,48/6,72 **ThyssenKrupp Duisburg** 5 882 · 1 173; 49,36/6,75 **Dillingen** 4 810 · 1 073;
  53,13/8,68 **ArcelorMittal Bremen** 4 739 · 1 151; 48,46/17,19 Slovnaft Bratislava 2 107 · 888.
- **NASAs Maske ist unvollständig:** 197 Zellen mit ≥ 30 verschiedenen Detektionstagen tragen `type 0` — über
  6–7 Jahre, zu 80–100 % nachts (z. B. 50,03/8,26 Mainz-Wiesbaden 144 Tage; 51,43/7,33 Hagen 127 Tage;
  47,47/12,63 Kitzbühel-Raum 97 Tage, 100 % nachts). Der Cache wurde am 2026-08-18 geholt, also **nach**
  NASAs Label-Korrektur vom Mai 2025 (VIIRS-C2-Monatsdateien v3). Eigene Persistenzzählung ist Pflicht.
- **Persistenzregel „≥ 2 Kalenderjahre mit je ≥ 5 verschiedenen Detektionstagen":** 462 Zellen —
  308 davon auch NASA `type 2`, **154 nur über eigene Zählung**.
- **Gegenprobe Jüterbog** (munitionsbelastete Fläche, brannte 2022 und 2023): keine Zelle erreicht zwei
  Jahre ≥ 5 Tage (Maximum: 1 Jahr, Zelle 52,07/13,02 mit 5 Tagen) ⇒ die Regel trennt wiederkehrende
  Vegetationsbrände von Anlagen **ohne** Geodaten.
- **Tagessignal-Block:** ein Teil der persistenten `type 0`-Zellen hat **0 % Nachtanteil** über bis zu
  6 Jahre (45,53/9,80 74 Tage; 45,56/9,30 56 Tage; 48,39/10,04 44 Tage; 53,52/11,66 25 Tage). Das ist keine
  Wärme, die nachts sichtbar wäre — Reflexion (PV-Felder, Glasdächer, Gewächshäuser) ist wahrscheinlicher.
  Eigene Klasse **C**, damit es nie „Industrie" heißt.

## 2. Ist-Zustand im Code (Datei:Zeile)

| Bereich | Ist |
|---|---|
| Ingest `firmsHotspots.ts` | `/_firms`, VIIRS NRT (SNPP/N20/N21), Fenster 24 h/168 h, `FirmsRow` (`:84-104`) ohne `type`; Hooks `classify` (`:583`), `staticKeys` → `props.stat` (`:469-496`). Kein persistenter Cache. |
| GWIS-Fallback `gwisHotspots.ts` | nur `id, acq_at, CLASS` ⇒ keine Ereignisse, keine Klassifizierung (`FirePage.tsx:378-387`). Bleibt. |
| Clustering | `spatialClusters` (`fireEvents.ts:136-191`, 1,5 km) — EIN Clustering; `fireClusters.ts` 2 km + Hülle. `FireCluster.staticCount/mostlyStatic` (`:308`), `staticKeys?` (`:255`). |
| F2 „ortsfest" | `STATIC_MIN_DAYS 5`, `STATIC_MOVE_M 1000`, `suspectedStatic` (`fireEvents.ts:73-79, 292`); EFFIS-Kartierung hebt auf (`FirePage.tsx:442-452`). Grau, nie ausgeblendet. **Bleibt unverändert; TA ist additiv.** |
| CORINE-Maske | `clcMask.ts` + `scripts/build-clc-mask.mjs` + `public/fire/clc-industry-mask.{png,json}` (121/131/132, 0,01°, 3×3-Toleranz, nur Plausibilität). Jans Entscheidung 2026-08-15: CORINE-only, **kein OSM** (ODbL). |
| Registry `fireRegistry.ts` | `FireRecord` (`:70-115`) mit `suspectedStatic` (`:108`); `RegistryInput.landcoverAt` (`:129`) = Injektionsmuster; `assess()` (`:361-365`); `badgeOf` (`brandradarMeta.ts:193-197`). |
| Merkmale | `features.ts` v1; `distinctDays`/Tag-Nacht-Zählungen werden in `FirePass.day` kollabiert (`overpasses.ts:110`). |
| Archiv-Skripte | `pairs-from-archive.mjs` (Schlüssel lokal, 5-Tage-Chunks, `type ≠ 0` verworfen `:135-142`), `geometry-eval.mjs` (netzfrei). |
| Panel | `readoutTab: 'layers'|'fires'` (`FirePage.tsx:233`), `MobileTab` (`:114`), `openTab` (`:2167`), `readoutTabs` (`:2137`), `bottomBar` (`:2173`), `firesMode` (`:1940`); `FireFootprintPanel.tsx` monolithisch (Deckel `CLUSTER_PAGE`, `.br-empty`-Leiter `:200-240`, `FootprintDetail` `:547`); Permalink `fp` (`fireState.ts:58,115,155`). Kein generischer Listen-Baustein. |
| Karte | `FireMap.tsx`: `GL_LAYERS` (`:106`), `CUSTOM_GL_LAYERS` (`:193`), Quellen (`:1358`), `SPECS` (`:1427`), Einfügeschleife mit `layout`-Merge (`:1724-1772`), Sprites (`:1714`), Klickkette (`:774-899`), `stateRef`/Deps (`:406, 489, 1022`). `fireModel.ts`: `FIRE_BIT_ORDER` (Bit 14 letzter), Z-Bänder, `FIRE_DECK_GROUPS`. |
| Batch/Transport | Fünf Workflows, **null `secrets.*`**, Commit-back `warm-grib.yml:70-96`. **R2 existiert im Repo nicht**; `audit/waldbrand-forecast.md:379`: „Die R2-Vorgabe des Auftrags ist zurückgenommen" (Jan 2026-08-19). |
| Budget | totalJs 922,3 / 926,1 KB (3,8 KB Luft), eagerCss 8,7 / 8,9. |

## 3. Quellen und Lizenzen

| Quelle | Zugang | Lizenz | Verdikt |
|---|---|---|---|
| FIRMS VIIRS SP (Area API) | MAP_KEY, Freigabe Jan 2026-08-14, lokal/Edge | NASA „no restrictions" | ✅ einzige Basis der Persistenzmaske. Keylos: Archive-Download = Earthdata-Login ⇒ blockiert; GWIS = 7 Tage ohne Attribute. |
| **EEA Industrial Reporting (E-PRTR/IED)** v16 | `sdi.eea.europa.eu/webdav/datastore/public/eea_t_ied-eprtr_p_2007-2024_v16_r00` → Datashare-Zip, ohne Login | **CC-BY 4.0**, Copyright EEA | ✅ DE/AT/CH; Anlagentyp (IED-Annex-I-Aktivität), Name, Muttergesellschaft, Koordinaten. |
| **MaStR** (Anlagenatlas-SQLite, Export 2026-07-07) | `combustion_extended` 93 705 Einheiten (3 715 „In Betrieb" ≥ 1 MW mit Koordinaten), `biomass_extended` 24 141 (5 153 „In Betrieb" ≥ 500 kW) | DL-DE/BY-2.0 | ✅ DE; Codes über `Katalogwerte.xml`: 2407 Steinkohle · 2408 Braunkohle · 2409 Mineralöl · 2410 Erdgas · 2411 andere Gase (2475 Hochofen-/Konvertergas = Stahl) · 2412 nicht biogener Abfall (MVA) · 2413 Wärme. **`market_actors` ist leer** ⇒ Betreibername nur aus `NameKraftwerk` ableitbar. |
| **BFE Elektrizitätsproduktionsanlagen** | `data.geo.admin.ch/ch.bfe.elektrizitaetsproduktionsanlagen/…_2056.csv.zip` (17 MB, LV95) | opendata.swiss **OPEN BY** | ✅ CH: `plantcat_12` Kehrichtverbrennung (28 ≥ 1 MW), `plantcat_11` Biomassenutzung (24), `subcat_8` Erdgas (20), Kernenergie (4). LV95 → WGS84 über `src/fire/sources/swissProjection.ts`. |
| CORINE 121/131/132 | im Repo | CLMS | ✅ Plausibilitäts-Flag. |
| EFFIS-RDA 2020–2026 | im Cache | CC BY 4.0 | ✅ Veto: kartierte Zellen sind keine Anlage. |
| OSM via Overpass/Geofabrik | Rate-Limit / PBF | ODbL Share-Alike | ⛔ nicht genutzt (Entscheidung 2026-08-15; E-PRTR/MaStR/BFE decken Typ + Name). |
| **EOG VIIRS Nightfire** | Registrierung | seit 2025-01-10: „Commercial uses … prohibited", keine Redistribution | ⛔ **BLOCKIERT.** Fackeln nur indirekt (Raffinerie-Standort + Persistenz). |

## 4. Ansatz

Zweistufig: **statische Standortliste** (Batch: Persistenzregel + EFFIS-Veto + Geodaten-Join ≤ 1,5 km, Klassen
A benannt / B unbenannt / C Tagessignal) **+ Signaturvergleich zur Laufzeit** (Hülle ± 1 Zelle, `grew()`,
`frpMaxPassMw ≤ p95 × 2`, keine EFFIS/EMS). Jede Abweichung ⇒ `'site-deviating'` = in **beiden** Listen mit
Badge, rot auf der Karte. Kein Treffer ⇒ wie heute (F2 läuft weiter und fängt neue Anlagen nach Archiv-Ende).
Verworfen (mit Grund): nur F2 verbessern (braucht 5 Tage Vorgeschichte, nennt keinen Typ); `type` allein (NRT
hat es nicht, 154 Zellen fehlen); nur Geodaten (CLC 121 = 2,1 % aller Zellen, würde Brände im Industriepark
filtern); Einzeldetektions-Klassifikator (Labels sind NASAs Maske — zirkulär; Nacht 84 % vs. 35 % reicht
nicht je Detektion); EOG VNF (blockiert); OSM (ODbL + Rate-Limit, bereits entschieden); Geodaten-Join im
Client (MaStR 6 GB).

## 5. Phasen
TA1 Batch (`scripts/fire/ta/`) → TA2 Format `public/fire/ta/thermal-sites-v1.json` → TA3 Client
(`src/fire/anomaly/`) → TA4 Reiter → TA5 Karte (Layer `fireAnomalies`, Bit 15, Z 79). Details im
Implementierungsplan (Jans Freigabe 2026-08-22).

## 6. Entscheidungen — Defaults dieser Session (Jan kann jede kippen)

| # | Frage | Default |
|---|---|---|
| 1 | Ablage | Commit-back nach `public/fire/ta/` — **kein R2** (Entscheidung 2026-08-19, null Secrets im Repo) |
| 2 | Batch-Ort | lokal mit Jans Schlüssel (wie AF4); **keine Workflow-Datei** (STOPP & FRAGEN) |
| 3 | OSM | Ausschluss beibehalten |
| 4 | Sichtbarkeit in „Brände" | Klasse `site` per Default herausgefiltert, Chip „Anlagen einblenden" + Zähler; `site-deviating` bleibt drin |
| 5 | Mobil | Segment in der Seite „Brände" (kein fünfter Bar-Eintrag) |
| 6 | Budget | Ratsche nur anheben, wenn die Messung es verlangt — ausgewiesen im Gate |
| 7 | Archiv | Monate 1–12 nachgeholt (SNPP + NOAA-20 SP); NOAA-21-SP nicht (Verfügbarkeit erst 2024, asymmetrisch) |
| 8 | Wortwahl | Reiter „Thermalanomalien"; Anlagenname nur mit Quelle + Abstand im selben Satz |
| 9 | Klasse D | nein (Anlage ohne Archivsignal kommt nicht in die Maske) |
| 10 | Schwellen | 2 Jahre / 5 Tage / 1,5 km; Sensitivität im TA1-Report |
| 11 | Zellkonvention | Floor-Zellen wie `clcMask.cellIndex` (Batch und Client aus EINER Funktion) |

## 7. Umsetzung TA1–TA5 (2026-08-22)

| Phase | Neu | Geändert |
|---|---|---|
| TA1 Batch | `scripts/fire/ta/fetch-archive.mjs` (Wintermonate nachgeholt: 1 358 Chunks, 538 145 Zeilen, 77 Monate), `persistence-grid.mjs` (Zellraster + EFFIS-Veto), `facilities.mjs` (E-PRTR v16 CSV + MaStR-SQLite + BFE-CSV → 21 422 Anlagen), `build-sites.mjs` (Union-Find ≤ 1,5 km, Join, Klassen, CLC-PNG-Decoder, GeoNames, Landesumrisse) | — |
| TA2 Format | `public/fire/ta/thermal-sites-v1.json` (199 KB roh, **36 KB gzip**), `data/fire/ta/{cells,sites}.report.json` | — |
| TA3 Client | `src/fire/anomaly/thermalSites.ts` (EINE Zellkonvention, Loader, `siteAt`), `anomaly/classify.ts` (vier Prüfungen, `grewFromPasses`), `scripts/verify-fire-anomalies.mjs` | `fireRegistry.ts` (`siteAt`, `FireRecord.anomaly`, `RecordFilter.sites`, `hiddenSiteCount`, Feature-Prop `anomaly`), `fireAssessment.ts` (`site`-Eingang, drei neue Checks), `brandradarMeta.ts` (Abzeichen ANLAGE/ABWEICHUNG), `FireFootprintPanel.tsx` (Badge + Kontextsatz) |
| TA4 Reiter | `src/fire/FireAnomalyPanel.tsx` | `FirePage.tsx` (dritter Reiter, Mobil-Segment in „Brände", Idle-Load, Auswahl), `fireState.ts` (Permalink `ta`), `fireDeck.css` (additiv) |
| TA5 Karte | `src/fire/anomaly/anomalyLayer.ts` (Rauten-Sprites A/B/C/dev, GeoJSON) | `fireModel.ts` (Bit **15**, Z-Band 79, Dock „Aktuelle Lage"), `fireTime.ts` (`instant`), `FireMap.tsx` (Quelle mit Attribution, Symbol- + Auswahl-Layer, Klickkette, Cursor), `FireLayerCard.tsx`, `fireIcons.tsx` |

**Messergebnisse des Batch (Jahresarchiv 2020-01 … 2026-05):** 24 480 belegte Zellen, **469 persistent** (306 mit NASA `type 2`, **163 nur über eigene Zählung**, 106 Tagessignal), EFFIS-Veto traf 84 Kandidaten. Sensitivität: 2 J/5 T = 469 · 2 J/10 T = 301 · 3 J/5 T = 389 · 3 J/10 T = 266. **218 Standorte**: A 145 · B 8 · C 65; Typen Zement 35, Stahl 33, Kraftwerk 17, Chemie 14, MVA 14, Raffinerie 12, NE-Metall 7, Glas 4, Zellstoff 4, Biomasse 3; Quellen E-PRTR 141, MaStR 2, BFE 2; Länder DE 92, AT 12, CH 8, außerhalb 106. 190 von 218 liegen auf CLC 121/131/132.

**Join-Lehren (gemessen, korrigiert):** (1) die nächste Anlage ist oft die Nebeneinheit — ohne Größenbonus stand „Notstromdiesel U9" (MaStR, 2,5 MW) statt Peiner Träger, „Eisenmetallguss" statt voestalpine; jetzt Rang = Gewicht + Größe (IED-Installationen, MW) − Abstand. (2) Die Anlagenart eines Werks ist die **schwerste** seiner Installationen, nicht die zuletzt gemeldete (voestalpine wäre „Kraftwerk", HKM „Abfall" wegen Mitverbrennung). (3) Klasse C bekommt **keine** Anlage — sonst stand die Schweinemast neben dem PV-Feld als „Anlage". (4) Die E-PRTR-CSV führt **keinen Betreiber** (der GeoPackage-Sitemap mit dem Feld ist 584 MB und brach dreimal am Download-Zeitlimit ab — nicht gebaut); MaStR-`market_actors` ist im Anlagenatlas-Export leer ⇒ `operator` bleibt `null`, die Detailkarte sagt das und verweist auf den Anlagennamen.

## 8. Gate GTA1–GTA5 — Belege

| # | Frage | Beleg |
|---|---|---|
| 1 | Funktionserhalt | F2-Heuristik, Grau, EFFIS-Override unverändert (`verify:fire-behoerden` 100/100, `verify:fire-registry` 81/81, `verify:fire-time` 127/127). Kill-Switch `?ta=0` ⇒ `anomaly` überall `null`, Brandliste wie zuvor. Bits 0–14 byte-gleich, Bit 15 angehängt (`verify:fire-model` 131/131 inkl. Permalink `ta`). **Bewusste Änderung (Entscheidung #4):** `site`-Einträge stehen per Default nicht mehr grau in der Brandliste, sondern im Reiter — Chip „In der Brandliste grau einblenden" + Zähler („87 Einträge mit Anlagenmuster stehen nicht in der Brandliste") |
| 2 | Desktop pixelgleich | nur `src/fire/*` berührt; Wetterkarte/Regenradar laden `fireDeck.css` nicht. Screenshot `audit/screenshots/ta-desktop-1440-anomalies.png` (1440×900): drei Reiter „Layer · Brände · 163 · Thermalanomalien · 89", Rauten auf der Karte, Attribution der Quelle in der Leiste |
| 3 | Touch ≥ 44 px | iPhone 12 Pro 390×844 DPR 3 (`ta-mobile-390-anomalies.png`): Segment 44/44, Zeilen 91, „Weitere laden" 44, Bottom-Bar 44; Chips 36 px — **identisch mit den Chips der Brandliste** (`.br-m-scroll .br-chip { min-height: 36px }`, BR1-Bestand, nicht neu); die zwei Textlinks per CSS auf 44 px gehoben |
| 4 | Konsole | keine Warnung/Fehler aus TA (Sprites registriert). Einziger Fehler: 17 × 404 `warnungen.zamg.at/…getWarningsForCoords` — GeoSphere-Kontext für Punkte außerhalb AT, **vorbestehend** |
| 5 | Long Tasks | Prod-Preview, Reiterwechsel Layer→Brände→Thermalanomalien + Standortauswahl + zurück: **max. 55 ms** (PerformanceObserver `longtask`) |

**Verifier:** `npm run verify:fire-anomalies` **56/56** — darunter: Zellkonvention Batch = Client für alle 469 Zellen; 16 bekannte Stahl-/Raffineriestandorte zu 100 % getroffen; sechs bekannte Brandflächen (Jüterbog, Gohrischheide, Sächsische Schweiz, Harz, Treuenbrietzen, Hohes Venn) ohne Standort; **1 von 618 AF4-Bränden** liegt ≤ 1,5 km an einem Standort (TOTALEnergies Leuna, 2023-09-24, 7 ha) und wird **ohne EFFIS-Wissen** allein über Raster + Wachstum als `site-deviating` gehalten (4 Pixel, 3 Überflüge). Live (22.08., 7-Tage-Fenster): 89 Einträge auf Standorten, davon 2 Abweichungen — Peiner Träger (Wachstum) und FANTONI (offene EMS-Aktivierung EMSR924, korrekt „als Brand behandelt").

**Budget:** totalJs 922,3 → **929,9 KB** (+7,6 KB gzip, Schätzung 8–12); Ratsche bewusst auf 934,0 KB (nur `totalJs`, andere Grenzen unverändert) — Entscheidung #6, im Diff von `budget.json` sichtbar.

**Vorbestehend, nicht von TA:** `verify:fire-clusters` 109/117 — acht Sonden prüfen Klassen (`fire-clist-note`, `fire-ro-layerinfo`, `fire-scales`, „weitere anzeigen") und Texte, die seit dem Command-Deck-Redesign (BR1) in `src/fire` nicht mehr existieren (per `grep` belegt); die zwei Reiter-Sonden wurden auf die neue Wahrheit (drei Reiter) nachgezogen, die acht anderen nicht angefasst.

## 9. Offen / nicht gebaut
- **GitHub-Actions-Workflow** für den Batch (neue Workflow-Datei = STOPP & FRAGEN; FIRMS-Schlüssel als Secret): erster Lauf lokal, Ergebnis committed. Neubau: `fetch-archive` → `persistence-grid` → `facilities` → `build-sites` → `verify:fire-anomalies` (~2 min netzfrei ab Cache).
- **Betreibernamen** (E-PRTR-GeoPackage `parentCompanyName`, 584 MB; MaStR `market_actors`) — siehe §7 (4).
- Sites außerhalb DACH (106, v. a. PL/CZ/IT/FR/LU) stehen in der Liste, weil das FIRMS-Fenster die Box 5,5–17,5/45,5–55,5 abdeckt (V-221); Filter per Klassen-Chip ist nicht nach Land — Nachziehen, falls gewünscht.
- R2 nicht verwendet (Entscheidung #1); OSM nicht verwendet (#3); Klasse D nicht gebaut (#9).
