# decisions.md — Entscheidungs-Log (ADR)

> Stand: 2026-07-31. Nachträglich aus Code, Audits und Session-Logs rekonstruiert.
> Format: **D-NN Titel** — Entscheidung · Begründung · Konsequenzen · Status.
> Neue Grundsatzentscheidungen werden hier ergänzt (eine Nummer pro Entscheidung, nie überschreiben — bei Revision neuen Eintrag mit Verweis anlegen).

## Produkt & Prinzipien

**D-01 Client-only, kein Backend.** Alle Daten werden im Browser geholt/dekodiert; Hosting statisch (Netlify). · Kostenfrei skalierend, kein Betriebsaufwand, Datenschutz by design. · Konsequenz: kein echtes Push, keine Accounts/Sync (localStorage-only), Rate-Limits treffen den Client; B2B/Alerting strukturell blockiert. · **Aktiv — größter strategischer Trade-off, in Planungsphase zu überprüfen.**

**D-02 Trackerfrei, keine Analytics.** Kein JS-Tracking; Messung nur über Server-Log-Parsing (`scripts/seo/parse-crawler-logs.mjs`). · Datenschutz als Differenzierung. · Konsequenz: kein Nutzungs-Funnel, kein RUM — Produktentscheidungen ohne Nutzungsdaten. · **Aktiv.**

**D-03 Ohne Account.** „LIVE · DE · AT · CH · OHNE ACCOUNT" ist explizites Produktprinzip; Personalisierung rein lokal (20 `buscosun.*`-localStorage-Keys). · **Aktiv.**

**D-04 Ehrlichkeits-Prinzip.** Unsicherheit, Datenlücken, Länder-Asymmetrien werden ausgewiesen (Spread/Hit-Rate-Features, Legenden-Hinweise, konservative Experten-Layer-Sprache — nie „Tornado"). Gate-blockierend (z. B. §0 bei F5). · **Aktiv, identitätsstiftend.**

**D-05 DACH-Fokus.** DE/AT/CH + Randpuffer; Globus ist bewusst Deko-/Kontext-Feature, kein globales Produkt. · **Aktiv.**

## Technik-Fundament

**D-06 Near-Zero-Dependencies.** GRIB2/AEC, RADOLAN, Projektionen, OI/Cholesky, Optical Flow, Isotonic etc. handgeschrieben; nur 6 Runtime-Deps. · Kontrolle, Bundle-Disziplin, keine Supply-Chain-Risiken. · Konsequenz: hoher Eigenwartungsaufwand, Bus-Faktor. · **Aktiv.**

**D-07 Handgeschriebener GRIB2-Decoder inkl. CCSDS-AEC (DRT 42),** DOM-frei. · **Aktiv.**
> **Ehrlichkeits-Korrektur 2026-08-03 (V-91):** Die frühere Formulierung „bit-verifiziert gegen eccodes" las sich als dauerhaft geprüfte Zusicherung. Sie ist es nicht. `scripts/verify-aec.mjs` importiert zwar den echten Decoder (kein Copy) und prüft wert- **und** bit-genau — die eccodes-Golddaten (`ref_meta.json`, `ref_*.npy`) liegen aber **nicht im Repo** und der referenzierte ICON-EU-Lauf `2026061700` ist auf opendata längst rotiert. Korrekt ist: **historisch verifiziert (erstmals grün 2026-06), derzeit nicht wiederholbar.** Golddaten wurden bewusst nicht eingecheckt (Jan, 2026-08-03) — `.git` ist mit ~350 MB bereits ein Problem (V-08). Stattdessen liegt die vollständige Erzeugungsanleitung im Kopf von `verify-aec.mjs`; der Alias `npm run verify:aec` existiert und beendet ohne Golddaten mit **Exit 2 = „kann nicht laufen"**, ausdrücklich nicht mit „bestanden".

**D-08 WebGL1 + Format-Verhandlung.** Custom-Layer auf WebGL1; Texturformat zur Laufzeit (half-float→float→RGBA8-Packing); explizite `highp`-Deklarationen (mediump kollabiert auf iOS bis zur invertierten Windrichtung). RGBA8-Pfad ist tabu für Änderungen. · **Aktiv.**

**D-09 FrameGovernor statt fixer Budgets.** Adaptive Qualität (EMA + Hysterese + Cooldown); FPS-Leiter 30→24→20 zuerst, Trail-0,5× letzter Hebel, **Partikelzahl nie ein Hebel** (Cross-Device-Optik-Parität); Repaint-Pause bei hidden/offscreen. „AdaptiveQualityController" war Altdoku-Fiktion. · **Aktiv (Phasen P/P2/P3 abgeschlossen).**

**D-10 Kein Test-Framework — Headless-Verifier-Harness.** Statt Vitest: ~30 `verify:*`-Skripte importieren echte App-Module in Node (`--experimental-strip-types`); ~68 Module mit `verify()`-Selbsttests; UI via Chrome-DevTools-MCP + Gates. · Konsequenz: keine Regressionstests für React/Hooks/SW; Verifier teils netzabhängig. · **Aktiv — Teststrategie ist Planungs-Thema.**

**D-11 Flag-Gating („Rule 2").** Neue Rechenpfade default-off hinter Flags mit benanntem Fallback; Flags gehen in Cache-Keys ein. Muster: Fusion v2 (5 Stufen-Flags, alles aus ⇒ byte-identisch v1). · **Aktiv.**

**D-12 Purity-Grenze.** Hot-Logic-Module (gribDecode, perfGovernor, precipSource, oi, mapState …) sind DOM/WebGL/netz-frei → in Node testbar. · **Aktiv, bei allem Neuen fortführen.**

## Daten & Meteorologie

**D-13 Fusion v2 = gestaffelte OI-Rewrite, Cutover vertagt.** Entscheidung A: produktiver Cutover erst nach Trainings-Artefakt + LOSO-Gate, dann **per Variable**. Captures via stündlichem Task-Scheduler-Job (Constraint C3: Fixtures in Git). · **In Vorbereitung, prod-inaktiv.**

**D-14 Niederschlags-Ansicht radar-only jetzt–2 h (N1, Jan 2026-07-24).** Modellhälfte 2–12 h entfernt — „kürzer & ehrlicher"; reine `precipSource.ts` entscheidet DE→RADOLAN / AT→INCA (≤3 h) / CH→rzc. · Ersetzt frühere 0–12-h-Ambition des Radar-Katalogs. · **Aktiv.**

**D-15 Sim-Radar (F3) gebaut, dann entfernt (N1-5).** ICON-D2 dbz_cmax-Layer wurde zugunsten der Radar-Ehrlichkeit stillgelegt und gelöscht. · Reste: `verify:simradar`-Skript + Audit als Spec lesbar (Aufräum-Kandidat). · **Revidiert/entfernt.**

**D-16 Per-Land-Modell-Switcher.** 2D-Layer-Modellwahl je DE/AT/CH aus Whitelist (purer `modelSource`-Reducer, ~25-Modelle-Katalog); Radar orthogonal; Native ist Default. · **Aktiv (Phase 3 UI offen).**

**D-17 Optical Flow statt CNN fürs Nowcasting.** Horn-Schunck + semi-Lagrange, weil intensitätserhaltend; stochastisches Flow-Ensemble für ehrlichen PoP-Spread. · **Aktiv.**

**D-18 Open-Meteo nur opt-in.** Free-Tier nicht-kommerziell + Rate-Limit → default aus, Consent-Gate im PointForecastPanel, Fallback BrightSky. · **Aktiv.**

**D-19 Experten-Layer konservativ (F5-Muster).** Spec-Schwellen wurden an gemessener Skala kalibriert (Original ~100× zu hoch); STOPP&FRAGEN-Eskalation an Jan ist der Weg bei Spec-Zweifeln. · **Aktiv.**

## Transport & Betrieb

**D-20 Edge-Proxy + Warm-Cron + Manifest (T1/T2/T2b/T2c).** DWD-Bytes via gehärtete Netlify-Edge-Functions mit Durable-Cache; GitHub-Crons wärmen und committen `latest-{grib,wind}.json` zurück (shallow-sicherer Retry-Loop, Crons 2 min versetzt); 24-h-Staleness-Guard + Scan-Fallback. Byte-Identität SHA-verifiziert. · **Aktiv in Prod.** Bekannte Lücke: kein Alert bei Cron-Stillstand.

**D-21 Rewrites statt CORS-Umbau.** `/_dwd_opendata`, `/_gfs` als Netlify-200-Rewrites, identisch im Vite-Dev-Proxy → gleiche URLs dev/prod. · **Aktiv — aber unvollständig: `/_mf`, `/_ecmwf`, `/_cscs` existieren nur in Vite (Prod-Defekt, s. `roadmap.md` §A).**

**D-22 SEO statisch + GEO.** Post-Build-Generator erzeugt statische Landing-/Wissens-Seiten, JSON-LD, Sitemaps, RSS; `llms.txt` + AI-Crawler-Allowlist; Messung über Logs. · **Aktiv (Paket `docs/seo-geo/`).**

**D-31 Vorprozessierte Raster statt GRIB2 im Browser (2026-08-24, Jan).** Wind und Temperatur der Wetterkarte kommen als **PNG von einem Daten-CDN** statt als GRIB2 vom eigenen Origin. Der Anlass war eine Rechnung: Netlify hat buscosun.com am 2026-08-22 mit `usage_exceeded` abgeschaltet. Der Hebel ist **nicht** „kleinere Bilder", sondern die Beobachtung, dass die App das Feld ohnehin schon reduziert — `buildWindRgba`/`buildTempRgba` tasten das native 1215 × 746-Float-Gitter auf 608 × 373 × 8 bit herunter, **bevor** irgendetwas gezeichnet wird; bisher tat das jeder Browser einzeln. Dieser Schritt wandert in einen Batch, Producer und Client importieren **dasselbe** DOM-freie Modul, und `verify:repack` beweist die Byte-Identität je Lauf. Gemessen an der Kaltsitzung der Wetterkarte: eigener Origin **7,42 → 1,24 MiB**, Datenanteil **6,67 MiB → 0** (0,74 MiB liegen auf dem CDN). · **Speicherweg: jsDelivr über ein eigenes öffentliches GitHub-Repo `buscosun-data`** — kein Cloudflare, kein R2, keine Secrets; adressiert wird über **Commit-SHA** (`immutable`), nicht über Tag oder Branch. · **Umfang bewusst eng: nur Wind + Temperatur.** Alle übrigen ICON-D2-Layer, RADOLAN, die amtlichen Warnprodukte und FIRMS bleiben auf dem bestehenden Edge-Proxy-Pfad (D-20/D-21) — teils, weil sie außerhalb des Repack-Umfangs liegen, teils, weil die Lizenzauflagen Durable-Caching verbieten (`docs/API.md` §7). · **Netlify bleibt der benannte Fallback**, nicht als Absichtserklärung, sondern im Ladeweg: zwei Fristen (3 s für den ersten Abruf einer Sitzung, danach 6 s je Datei), ein Fehlschlag gilt für die Sitzung, und fehlt der Manifest-Abschnitt, wird ohne Umweg GRIB geladen — der Normalfall mehrmals täglich zwischen DWD-Publikation und Producer-Lauf. jsDelivr ist ein kostenloses Fremd-CDN ohne SLA; die CDN-Basis ist deshalb eine Konstante (`scripts/lib/repackManifest.mjs`), ein Wechsel wäre ein Ein-Zeilen-Diff. · **Kill-Switch:** `?repack=0` für den Aufruf, `localStorage.repack = '0'` dauerhaft. · Beleg: `audit/bandbreite.md` §19–§23, Verifier `verify:repack`. · **Aktiv (default-on seit BW-4) — wirksam erst, wenn die Warm-Crons committet und der Producer-Batch dispatcht sind (Jans Gate).**

## UX & Prozess

**D-23 Command-Deck-Designsprache.** Helles Sand/Ink-System (League Spartan), Topbar+Rail+Dock-Muster, per-Feature-Token-Namespaces; PNG-Mockups in `references/` sind die Vorlage. · Konsequenz: Muster kopiert statt abstrahiert; Globus/Validation/Feedback noch alt. · **Aktiv, Vereinheitlichung offen.**

**D-24 MapLibre statt Three.js — überall.** Auch Globus (MapLibre-Globe) und 3D-Schnitte (CurtainLayer) laufen über MapLibre; Three.js/WebLLM-Nennungen in Alt-Doku sind überholt (KI-Meteorologe wurde entfernt). · **Aktiv.**

**D-25 Sieben-Dateien-System + Diagnose-First-Gates.** CLAUDE/plan/context/checklist/tests/prompt/audit-Struktur mit belegpflichtigen Gates und fünf Selbstverifikations-Fragen. · Bewährt; Schwäche: Session-Logs maskierten sich als Projekt-Doku (2026-07-31 bereinigt: dauerhafte Doku von Session-Doku getrennt). · **Aktiv, generalisiert in `agents.md`.**

**D-26 Sprachpolitik.** Doku Deutsch, Prompts Englisch, Commits Englisch (Conventional Commits). Code-Kommentare de facto gemischt; Neuanlage Englisch. · **Aktiv.**

**D-27 Command-Deck ist der verbindliche Design-Standard (Jan, 2026-07-31).** Präzisiert D-23: Das helle Command-Deck-System (Sand/Ink, League Spartan, Topbar+Rail+Dock, per-Feature-Token-Namespaces, `references/*.png` als Vorlagenlogik) gilt **verbindlich für alle Features und jede Neuentwicklung**. Alt-Themes (Globus, Validation, Feedback) werden migriert, nicht erweitert; neue UI entsteht ausschließlich im Command-Deck-Stil. Ziel-Zusatz: Muster als geteilte Deck-Shell abstrahieren statt weiter kopieren. · Umsetzungspfad: `improvements.md` V-10. · **Aktiv.**

**D-28 Verbesserungskatalog als Pflichtprozess (2026-07-31).** Jede von Agenten gefundene Verbesserung wird als `V-NN`-Eintrag in `improvements.md` dokumentiert — zwingend mit **Mehrwert** (verständlich für Jan) und **Umsetzungsskizze**. Kein Befund verschwindet in Session-Logs. · **Aktiv.**

**D-30 Pfadbasiertes Client-Routing mit React Router (2026-08-22, Jan).** Jedes Feature bekommt eine sprechende, indexierbare Pfad-URL (`/wetterkarte/wind`, `/regenradar`, …); Kartenzustand liegt in der Query, Canonical ist immer der Pfad ohne Query. `react-router` 7.18 ist die **7. Runtime-Dependency — bewusste Ausnahme von D-06** (v8 hätte einen React-Bump verlangt, abgelehnt). Hebt die Leitentscheidung „Hash bleibt" (V-05, `audit/strategie-2026-07-31/ux-designsystem.md` §4) auf; die Feature-Codecs `#wb=`/`#ev=`/`#h=`/`#atm=`/`#g=` bleiben als Fragment unter dem neuen Pfad, Alt-Links werden clientseitig migriert. Server: explizite 200-Rewrites je Route in `netlify.toml` (KEIN `/*`-Catch-all — V-101 bleibt), 301-Aliase; Trailing-Slash-Normalisierung nur clientseitig (Netlify-Loop), Route-Shells als flache `dist/<route>.html`. Beleg: `audit/routing.md`, Verifier `verify:routing`. · **Aktiv.**

## Offene Entscheidungen (für die Planungsphase)

- **O-01 Backend-Frage:** Bleibt D-01 (client-only) bestehen, oder kommt ein minimales Backend für Push/Accounts/B2B? Berührt D-03, Zielgruppen-Lücken 2/4 (`docs/zielgruppen-dach.md`).
- **O-02 Teststrategie:** D-10 fortführen, ergänzen (Komponenten-Tests? Playwright-CI?) oder revidieren?
- **O-03 Domain-Kanonik:** buscosun.com vs. buscosun.app endgültig festlegen (SEO-kritisch).
- **O-04 MapView-Zerlegung:** Wie wird das 4.000-LOC-God-Object risikoarm modularisiert (Voraussetzung für parallele Agenten-Arbeit)?
- **O-05 i18n:** Deutsch-only festschreiben oder Mehrsprachigkeit (mind. EN) vorbereiten?
- **O-06 Analytics:** Bleibt D-02 absolut, oder kommt privacy-erhaltendes RUM/Error-Tracking (selbst gehostet, aggregiert)?

---

## Entscheidungsvorlagen O-01 … O-06 (Agent-Teams-Session 2026-07-31)

> **Status: Vorlagen, keine Entscheidungen.** Erarbeitet von den Rollen-Deep-Dives unter `audit/strategie-2026-07-31/`; jede Empfehlung ist begründet und mit ihren Gegenargumenten ausgewiesen. **Die Entscheidung trifft ausschließlich Jan.** Nach der Entscheidung ist je Punkt ein neuer `D-NN`-Eintrag anzulegen (nie überschreiben, Format-Regel oben).

### O-01 Backend-Frage — Empfehlung: **Option B, gestaffelt und flag-gated**

**Ausgangslage (belegt):** `src/notifications` ist **vollständig gebaut bis auf den Transport** — der Vertrag steht (`notificationBackend.ts:47-60`), die Auslöse-Logik ist **pur und DOM-frei** und laut Modul-Header ausdrücklich dafür gedacht, „derselbe Code … in einem Node-/Edge-Worker" zu laufen (`:14-17`), die Anbindung ist als Einzeiler vorgesehen (`:23`). Es fehlt nur: Subscriptions speichern + periodisch auswerten + Web-Push senden. **Wichtig für die Bewertung:** buscosun betreibt **bereits** serverseitige Rechenzeit (zwei Edge Functions, zwei GitHub-Crons, die stündlich hunderte Requests fahren und ins Repo zurückschreiben). „Kein Backend" ist bei genauer Betrachtung schon heute „kein *Zustands*-Backend"; Option B fügt **einen** Zustand hinzu: eine Liste von Push-Endpunkten.

| | **A — client-only bleibt** | **B — Minimal-Backend** | **C — volles Backend** |
|---|---|---|---|
| Umfang | unverändert | 1 Netlify Function `/api/push` + Netlify Blobs + VAPID + 1 GitHub-Cron nach dem Warm-Muster | Auth, DB, Sync, Rate-Limiting, Abrechnung, Support |
| Kosten/Monat | 0 € | **0–10 €** (im bestehenden Plan enthalten) | 50–200 € + **Zeit als eigentlicher Posten** |
| Wartungslast (Bus-Faktor 1) | unverändert | **≈ +30 %** (+1 Function, +1 Cron, +1 Secret-Rotation) — gemessen an vier bereits laufenden Betriebsartefakten | Dauerlast: DSGVO-Auskunft/Löschung/Meldepflichten, Passwort-Resets, Sicherheitslücken |
| D-02 (trackerfrei) | unberührt | **unberührt** — kein Tracking, keine Analytik | beschädigt |
| D-03 (ohne Account) | unberührt | **unberührt** — die Subscription *ist* die Identität und lebt im Browser | **verletzt direkt** |
| Datenschutz-Story | makellos | erstmals Daten mit Personenbezug auf einem Server (pseudonyme Geräte-Adresse + ungefährer Ort) ⇒ Datenschutzerklärung (**ohnehin überfällig, A14**), AV-Vertrag, Löschkonzept | aufwendig |
| Preis / Gewinn | Der laut Zielgruppenanalyse **größte Einzelhebel** bleibt strukturell verschlossen; ~1.500 LOC bleiben Blindleistung | schaltet V-16/V-90 frei; als Nebenprodukt auch V-88 (Manifest über Blobs, spart ~655 Builds/Monat) und den opt-in Fehler-Beacon | Accounts/Sync/B2B — bei Bus-Faktor 1 **nicht verantwortbar** |

**Empfehlung:** **B**, aber **erst nach den §A-Defekten und nach der Datenschutzerklärung.** Begründung: (1) löst den größten dokumentierten Zielgruppen-Hebel; (2) kostet praktisch nichts und nutzt **exakt** das Betriebsmuster, das Jan bereits beherrscht; (3) bricht **keine** der vier Differenzierungsachsen; (4) ist **umkehrbar** — Flag aus, Function löschen, Blob leeren, Client fällt auf `NULL_BACKEND` zurück. **A** bleibt bis dahin die gültige Grundlage. **C** ablehnen, solange Bus-Faktor 1 gilt.
**Sprachliche Konsequenz, ehrlich benannt:** „OHNE ACCOUNT" bleibt wahr; „ohne Backend" müsste zu „ohne Account, ohne Profil" präzisiert werden.
**Reihenfolge:** §A-Defekte → Datenschutzerklärung/Impressum (V-103) → **Pilot mit einem einzigen Auslöser-Typ und ≤ 100 Abos**, Rate-Limit + globaler Kill-Switch als Teil der Definition of Done → Auswertung → Ausbau. Umsetzungspfad: **V-90**.
**Restrisiko:** Ein Push-Versand-Bug erreicht Nutzer *außerhalb* der App und ist **nicht per Deploy zurücknehmbar**.

### O-02 Teststrategie — Empfehlung: **Option B jetzt, C als Stufe 2**

**Ausgangslage (belegt):** **25** `verify-*.mjs` (Doku sagt „~30"), davon **20 mit wirksamer Assertion** und **12 netzfrei**. `src` enthält **76 `verify()`-Exporte in 69 Dateien**, aber nur **8** hängen an einem npm-Skript. **18 Harness-Integritäts-Befunde**, darunter vier P0: das Fusions-Gate kann weder bestehen noch fehlschlagen, der LOSO-Verifier assertiert auf echten Daten nicht, ein Verifier prüft ein Oracle gegen sich selbst, und die Warm-Crons melden im Fehlerfall Erfolg.

| | **A** unverändert | **B** D-10 + CI + gehärtete Verifier (**0 neue Deps**) | **C** B + Playwright-Smoke (1 devDep) | **D** Vitest-Migration |
|---|---|---|---|---|
| Aufwand | 0 | **2–3 Tage** | B + 1–2 Tage | **Wochen** (~25 Harnesses portieren) |
| Fängt zusätzlich | nichts | Typfehler · Build-Bruch · Edge-Function-Typfehler · Regression in aller reinen Logik · SEO-Regression · Bundle-Wachstum · Cron-Stillstand · ~68 verwaiste `verify()` | weiße Seiten · Lazy-Chunk-404 · Mount-Fehler auf allen 12 Einstiegen · kaputte Deep-Links | **nichts**, was B/C nicht fängt |
| Wartung (1 Maintainer) | hoch (alles manuell) | **minimal** | mittel (Selektoren brechen bei Redesigns) | hoch |
| Agent-Team-Wirkung | **negativ** — parallele Agenten brechen sich still gegenseitig | **entscheidend** — jeder Agent bekommt in ~3 min ein maschinelles Urteil | zusätzlich wertvoll bei UI-Parallelarbeit | keine über B hinaus |
| Verträglichkeit | — | D-06 ✅ D-10 ✅ D-12 ✅ | D-06 ⚠ (1 devDep) | **verletzt D-06 und D-10** |

**Warum A ausscheidet:** „Unverändert fortführen" bedeutet heute konkret die **Konservierung eines Defekts** — ein Cutover-Gate, das nicht urteilen kann, ein Realdaten-LOSO ohne Assertion, ein tautologischer Verifier und Crons, die im Fehlerfall Erfolg melden.
**Warum D ausscheidet:** Der entscheidende Wert der bestehenden Harnesses ist, dass sie über `register-ts.mjs` **den echten Produktionscode** importieren („was hier grün ist, ist exakt das, was der Browser ausführt"). Vitest würde das nicht verbessern, sondern nur ein Framework darumlegen — bei direktem Konflikt mit D-06.
**Empfehlung:** **B jetzt; C als Stufe 2 gemeinsam mit V-10/V-12** (dann zahlt Playwright doppelt: Smoke-Tests **plus** `axe`-Läufe fürs A11y-Programm). **D-10 bleibt gültig und wird nicht revidiert**, sondern um zwei Sätze ergänzt — *„Verifier müssen fehlschlagen können (Red-Test-Nachweis) und laufen in CI"*. Vorschlag: neuer ADR **D-29** mit Verweis auf D-10.
**Zwingende Reihenfolge:** **erst Harness-Integrität (V-91, V-29), dann CI (V-93)** — CI ohne Harness-Integrität automatisiert die Selbsttäuschung.

### O-03 Domain-Kanonik — Empfehlung: **buscosun.com**, unter Vorbehalt

**Beleg:** **16 produktive `.app`-Fundstellen gegen 3 `.com`.** `.app`: `scripts/seo/content.mjs:13` (Wurzel aller Canonicals/JSON-LD/OG-URLs/Sitemaps), `public/robots.txt:45,46`, `public/llms.txt` (10 Links), `public/_og-card.html:55` (**in allen 14 OG-PNGs eingebrannt**), `src/event/icsExport.ts:137`, `src/notifications/notificationBackend.ts:23` (nur Kommentar). `.com`: beide Warm-Manifeste (aus Repo-Variable `SITE_URL`), Kontaktadresse `src/feedback/FeedbackPage.tsx:5,28`.

**Begründung für `.com`:** (1) Der **Betrieb** läuft bereits vollständig auf `.com` — Warm-Crons, Edge-Cache, Manifeste; ein Wechsel auf `.app` hieße, die produktive Cache-Kette umzuhängen (höheres Risiko als Textänderungen). (2) Die **Kontaktadresse** ist `@buscosun.com`. (3) `roadmap.md` §E führt „buscosun.com ist die Zieldomain" bereits als Arbeitsannahme. (4) `.com` ist für ein DACH-Publikum das erwartete TLD.
**Gegenargument, ehrlich benannt:** Falls `buscosun.app` bereits SEO-Historie und Backlinks hat, wäre ein Wechsel ein temporärer Rankingverlust. **Das ist nur mit Search-Console-Daten entscheidbar — die Empfehlung steht unter diesem Vorbehalt.**
**Umsetzung:** 18-Schritt-Checkliste in `audit/strategie-2026-07-31/seo-geo-recht.md` §3.2 und `infra-betrieb.md` §8.3 (V-100). **Drei Punkte, die V-02 nicht kannte:** OG-Bilder neu rendern · SW-Cache-Version bumpen · Search-Console-Adressänderung. **`SITE_URL` unverändert lassen** — sie darf nie auf eine per 301 weitergeleitete Domain zeigen. **HSTS-`preload` erst danach** (danach ist ein Domainwechsel deutlich teurer).

### O-04 MapView-Zerlegung — Empfehlung: **achtstufiger Plan, Schritt 0 zuerst**

**Ausgangslage (gemessen):** `MapView.tsx` 3.971 LOC · 26 useState · 56 useEffect · 64 useRef. `:1089-1136` und `:2764-2811` sind **48 Zeilen byte-identisch** (per `diff` verifiziert); drei weitere Teil-Duplikate; `map.moveLayer(STATIONS_LAYER_ID)` steht **5×**, `moveLayer` gesamt **17×**. Die Kommentare dort dokumentieren einen **realen Nutzer-Bug** („Regen über Belgien/Slowenien"), der aus einer falschen Hebung entstand.

**Vorschlag:** Acht Schritte, **jeder einzeln gate- und pixel-diff-fähig** (Volltext mit Code-Skizze, Erhalt-Kontrakten und vier konkreten Fallen: `audit/strategie-2026-07-31/rendering-performance.md` §5):
**Schritt 0** Golden-Verifier + Screenshot-Baseline, **bevor sich Code bewegt** → **Schritt 1** deklarative Layer-Registry (pure Module + **ein** DOM-Applier, V-38) → Fabrik → Fetch-Orchestrierung (**riskantester Schritt**, Gate = Netz-Messung) → Frame-Effekte → Deck-UI → Punkt-Forecast → Ziel **< 400 LOC**.
**Zwei Erhalt-Kontrakte, die nicht brechen dürfen:** Wind liegt **bewusst über** Grenzen/Labels (`MapView.tsx:1060`, kein `beforeId`); Stationen müssen **über** der Länder-Maske bleiben.
**Kernargument:** O-04 ist keine Aufräumarbeit, sondern **Voraussetzung für drei der vier Differenzierungs-Achsen** — jede Karten-Verbesserung (σ-Layer, Isochronen, Vertikalschnitt, Modell-Chip, Lazy-Layer) ist heute durch das God-Object blockiert. Zusätzlich ist es die Voraussetzung dafür, dass mehrere Agenten parallel arbeiten können (`agents.md` §3 führt die Datei als Sperrzone).
**Empfehlung zur Reihenfolge:** Schritt 0+1 in „Next"; alles Weitere erst, wenn Schritt 1 ein grünes Gate hat.

### O-05 i18n — Empfehlung: **Option A („Deutsch-only" bewusst festschreiben) + drei Vorbereitungen**

**Ausgangslage (gemessen):** ≈ **2.500 deutsche Strings in ≈ 255 Dateien** (davon ~1.400 UI-Strings in 105 `.tsx`); **die 10 größten Dateien halten ~44 % des UI-Textes** — und das sind exakt die drei Hochrisiko-Sperrzonen `MapView.tsx` (116), `EventResult.tsx` (109), `HistoryPage.tsx` (87). Formatierung: `'de-DE'` **91×** hart verdrahtet, `'de-AT'`/`'de-CH'` **0×**, `Intl.NumberFormat` **0×**, Dezimalkomma **65× von Hand**, **236× „ß"** (in der Schweiz falsche Orthografie).

| | **A** Deutsch-only | **B** EN vorbereiten, hand-rolled | **C** i18n-Bibliothek |
|---|---|---|---|
| Kosten jetzt | 0 | Infrastruktur ~1 Tag + Extraktion 4–6 Tage + Übersetzung ⇒ **2–4 Wochen**, danach ist **kein einziger englischer Satz** geschrieben | 40–60 KB gzip + Abhängigkeitsbaum |
| Kosten später | Retrofit **3–6 Wochen** — **billiger, nicht teurer, wenn nach V-14 gemacht** | — | — |
| D-06 | ✅ | ✅ | **❌ verletzt** (6 Runtime-Deps heute) |
| Nebenwirkung | — | Code verliert Lesbarkeit: `{t('map.deck.honesty.note')}` macht die **Ehrlichkeits-Formulierungen unsichtbar an der Stelle, wo sie geprüft werden** (D-04, gate-blockierend bei F5) | dito + Fremdcode |

**Begründung gegen die vier Achsen:** Die Alleinstellungsmerkmale sind an **DACH-Geografie, DACH-Datenquellen und DACH-Behördenwarnungen** gebunden; die alpine Fachsprache (Föhn, Tal/Grat, Inversion) ist deutschsprachig, und eine Übersetzung ohne Fachlektorat wäre schlechter als kein Angebot (D-04). Englischsprachige Nutzer *im* DACH-Raum sind eine reale, aber kleine Zielgruppe, die in `docs/zielgruppen-dach.md` nicht auftaucht.
**Der stärkste Einzelgrund gegen B:** Eine i18n-Extraktion **vor V-14** würde 116 Strings im 3.971-LOC-God-Object anfassen — Regressionsrisiko ohne Gegenwert. **Reihenfolge zählt: V-14 zuerst, i18n (falls je) danach.**
**Empfehlung: A**, mit drei Vorbereitungen, die **auch ohne i18n Wert stiften**: (1) Formatierung zentralisieren (V-76) — sofort konsistente Rundung/Tausendertrennung, halbiert später den i18n-Aufwand; (2) Konvention „keine neuen `'de-DE'`-Literale" in `CLAUDE.md`; (3) explizite Entscheidungsnotiz mit **benanntem Auslöser für eine Neubewertung** (messbare Nachfrage aus dem englischsprachigen DACH-Publikum oder ein B2B-/Embed-Produkt).
**Unabhängig davon empfohlen:** die **Landesvarianten** (V-77) — `ß→ss` für CH und `'de-AT'` für österreichische Monatsnamen. Das ist kein i18n-Problem, sondern ein DACH-Sorgfaltsproblem, und die App kennt das Land bereits.

### O-06 Observability — Empfehlung: **Option B (Betriebs-Monitoring), C ablehnen**

| | **A — Status quo** | **B — Betriebs-Monitoring, keine Nutzerdaten** | **C — privacy-erhaltendes RUM, selbst gehostet** |
|---|---|---|---|
| Umfang | — | Cron-Wächter (V-79) · synthetische Sonde (V-86) · **Frische-Badge im Produkt** (V-19/V-20) · Kontrakt-Nightly (V-87) | zusätzlich aggregierte Feldmetriken (LCP/INP/CLS, Fehlerraten) |
| Kosten | 0 € | **0 €** | 5–15 €/Monat + Setup + Updates + Backups + Angriffsfläche |
| Datenschutz-Wirkung | keine | **keine** — es werden ausschließlich **eigene Systeme** geprüft; D-02/D-03 unberührt, keine Änderung der Datenschutzerklärung nötig | Grenzfall: auch cookielose Aggregation erhebt Gerätedaten ⇒ DSGVO-Prüfung, und die Aussage „trackerfrei" müsste umformuliert werden |
| Erkennt Cron-Ausfall? | **nein** | ja, < 1 h | ja |
| Erkennt Prod-Regression? | nein | ja | ja + Nutzerwirkung messbar |

**Empfehlung: B**, sofort und vollständig. **C ablehnen**, solange die Nutzerbasis keine statistisch belastbaren RUM-Daten liefert und „trackerfrei" ein Marketing-Asset ist.
**Wichtigster Einzelposten ist der Frische-Badge (V-19):** Er verlegt Monitoring **ins Produkt** statt in ein Dashboard, das niemand ansieht — passend zum Ein-Personen-Betrieb — und macht zugleich Achse 3 sichtbar. Ein optionaler Fehler-Beacon (Opt-in, Default aus, 14 Tage Aufbewahrung, keine IP/ID/Koordinaten) wird **zurückgestellt, bis O-01 Option B ohnehin einen Endpunkt bereitstellt**.

### Zusätzlich zur Entscheidung vorgelegt (neu aus dieser Session)

- **O-07 Monetarisierung / Trägermodell** — bisher undokumentiert (`roadmap.md` §E). **Struktureller Befund:** Das meistverkaufte Wetter-Produkt in DACH ist „werbefrei" — und buscosun **ist bereits werbefrei**; dieser Hebel steht also nicht zur Verfügung. Verkaufbar wären nur Funktionen, die heute alle frei sind ⇒ **direkter Konflikt mit der Obersten Direktive Funktionserhalt**. Sieben Optionen mit Verträglichkeitsanalyse in **V-124**; risikoärmster Einstieg sind **Embeds (V-118)**, weil sie weder Account noch Backend noch Funktionsentzug erfordern. **Nur Jan entscheidet.**
- **O-08 Fünfte Differenzierungs-Achse „KI-Modell-Transparenz"?** — buscosun ingestiert AICON/AIFS/AIFS-ENS bereits mit `ai: true`; kein Anbieter kennzeichnet Physik vs. KI gegenüber Endnutzern. Erhebung zur Achse = Jans Entscheidung (V-122). Vorbedingung: V-01 (AIFS ist in Prod tot).

---

## Entscheidungsvorlagen O-09 … O-14 (2D-Layer-Erweiterung, Analyse 2026-08-05)

> **Status: Vorlagen, keine Entscheidungen.** Erarbeitet aus der Projekt- und Quellenanalyse zur
> 2D-Layer-Erweiterung (`docs/DATA_SOURCES.md`, `docs/LAYER_SYSTEM.md`, `docs/MAP.md`,
> `docs/2d-layer-erweiterung.md`). Jede Empfehlung ist begründet und mit ihren Gegenargumenten
> ausgewiesen. **Die Entscheidung trifft ausschließlich Jan.** Nach der Entscheidung ist je Punkt ein
> neuer `D-NN`-Eintrag anzulegen (nie überschreiben, Format-Regel oben).

### O-09 Registry zuerst oder Layer zuerst? — Empfehlung: **Registry zuerst**

**Ausgangslage (belegt):** Ein `LayerKey` ist an **neun** Stellen verdrahtet; der Sichtbarkeits-Block
steht **zweimal, 48 Zeilen byte-identisch** (`MapView.tsx:1108-1136` / `:2818-2846`), `moveLayer`
insgesamt **17×**. `src/mapState.ts` `LAYER_ORDER` listet nur **12 von 16** Keys — `thunder`,
`lightningfc`, `snow` und `rotation` sind heute **nicht permalink-fähig**. `MapView.tsx` ist auf
4.173 LOC gewachsen und in `agents.md` §3 als Sperrzone geführt.

| | **A — Layer direkt verdrahten** | **B — Registry zuerst (empfohlen)** |
|---|---|---|
| Aufwand bis zum 1. neuen Layer | ~2 T | ~6–11 T (L0+L1+L2) |
| Aufwand je weiterem Layer | ~2 T + 9 Änderungsstellen | ~0,5–1 T + 1 Deskriptor |
| Aufwand für 9 Layer | ~18 T, **81 Änderungsstellen in der Sperrzone** | ~11 T Infrastruktur + ~9 T Layer |
| Permalink-Defekt | wächst auf 13 fehlende Keys | wird strukturell unmöglich (Verifier) |
| `MapView.tsx` danach | ~5.400 LOC | **kleiner als heute** |
| Parallele Agent-Arbeit | weiter blockiert | möglich (je Layer eine Datei) |
| Regressionsrisiko | steigt mit jedem Layer | einmalig, unter Golden-Baseline |

**Empfehlung: B.** Ab dem vierten Layer ist B schon billiger, und B liefert nebenbei **Schritt 1 des
in O-04 empfohlenen Zerlegungsplans (V-38)** — die Erweiterung finanziert eine ohnehin geplante
Strukturverbesserung. **Gegenargument, ehrlich benannt:** B verschiebt den ersten sichtbaren
Nutzergewinn um ~1–2 Wochen. Wer schnell etwas zeigen will, kann **L3 (Warnungen DE)** als einzigen
Layer vor der Registry bauen — er ist ein nativer GeoJSON-Layer und berührt die Custom-Layer-Kette
kaum. Mehr als einen Layer vorzuziehen wäre eine Wette gegen die eigene Beleglage.

### O-10 Wie weit reicht die Zeitachse in die Vergangenheit? — Empfehlung: **60 Minuten, konfigurierbar**

**Ausgangslage:** Der Slider läuft heute `0…+N`. Die neuen Layer bringen sehr verschiedene
Vergangenheitsachsen mit: MeteoSchweiz-Radar und -Hagel **14 Tage**, `dwd:Blitzdichte` **13 Monate**,
MTG-LI **14 Monate**, RADOLAN-RV nur **~48 h**.

| | **A — kein Rückblick** | **B — 60 min (empfohlen)** | **C — 24 h** | **D — volles Archiv** |
|---|---|---|---|---|
| Nutzen | keiner | „woher kam das", Zellverfolgung | Tagesverlauf | Recherche |
| Speicher | 0 | 12 Frames/Layer | ~288 Frames/Layer | unbegrenzt |
| Netz beim Öffnen | 0 | 12 RV-Tars aus dem Cache | viel | sehr viel |
| DE-Abdeckung | — | ✅ RV-Retention 48 h reicht | ✅ | ❌ nur 48 h |
| Konsistenz DACH | — | ✅ alle Quellen können 60 min | ⚠️ AT dünn | ❌ |

**Empfehlung: B.** 60 Minuten beantworten die Nutzerfrage („zieht das auf mich zu, woher kam es")
vollständig, passen in jedes Speicherbudget und sind bei **allen** Quellen verfügbar — das ist der
entscheidende Punkt, weil eine ungleiche Rückblickstiefe je Land wieder eine Asymmetrie erzeugen
würde, die zu erklären ist. Die Fenstergröße bleibt eine Konstante im Deskriptor, damit C später
ohne Umbau möglich ist. **Gegenargument:** Für Nachbereitung („wie war das Unwetter gestern?") ist
60 min zu wenig — das ist aber fachlich eher ein Fall für die Historie-Ansicht als für die Live-Karte.

### O-11 WMS-Animation: Fenster puffern oder TIME durchreichen? — Empfehlung: **puffern, Fenster begrenzen**

**Ausgangslage:** Ein `TIME`-Wechsel an einer MapLibre-Raster-Source bedeutet eine **neue Source-URL**
und damit das vollständige Neuladen aller sichtbaren Kacheln. `dwd:Blitzdichte` hat ein
13-Monats-Extent im 5-Minuten-Raster — das sind ~113.000 mögliche Frames.

**Empfehlung:** Frames des Animationsfensters (12 Stück = 60 min) als `ImageBitmap` in einen
LRU-Puffer laden und lokal umblenden, statt bei jedem Schritt die Source zu wechseln. Kosten: ein
kleines Modul (`src/map/wmsFrameLoader.ts`), Nutzen: flüssiges Scrubbing ohne Kachelsturm.
**Gegenargument:** Das umgeht MapLibres eigenes Kachel-Caching und bindet Speicher außerhalb des
`frameBudget`. Deshalb gehört der Puffer **in** das Budget (O-13), nicht daneben.

### O-12 Layer-Gruppen und Presets — Empfehlung: **Gruppen ja, Presets ja, Ausschluss nur im Band `precip`**

**Ausgangslage:** 16 Layer sind im Dock heute schon eine lange Liste; 25 sind auf Mobil nicht mehr
bedienbar. `docs/high-end-radar-feature-catalogue.md` §3 formuliert die Regel bereits: nie mehr als
~3 Layer gestapelt als Default, dazu ein Panel mit sinnvollen Presets.

**Vorschlag:** sechs Gruppen (Niederschlag · Gewitter · Wind · Temperatur & Wolken · Warnungen ·
Mess & Meta), sechs Presets (Standard · Gewitter-Jagd · Winter · Wandern · Unwetterlage ·
Landwirtschaft). Ein Preset ist technisch nur ein `LayerKey[]` und passt ohne Erweiterung in
`initialActive` und in die Permalink-Bitmaske.

**Gegenseitiger Ausschluss nur dort, wo er fachlich zwingend ist:** Regenradar, Hagel und Schneefall
liegen alle im Band `precip` — gleichzeitig sichtbar ergeben sie Farbmatsch. Ein weicher Ausschluss
(der zuletzt aktivierte gewinnt, mit sichtbarem Hinweis) ist ehrlicher als eine harte Sperre.
**Gegenargument gegen jeden Ausschluss:** Er kollidiert mit der Obersten Direktive
„Funktionserhalt", wenn er als Wegnahme wahrgenommen wird — deshalb weich, sichtbar und
umschaltbar, nicht hart.

### O-13 Speicherbudget für Frames — Empfehlung: **globaler LRU, an das FrameGovernor-Tier gekoppelt**

**Ausgangslage (Rechnung):** Ein DE1200-Frame ist 1100 × 1200 = **1,32 MB** als Uint8; 25 Frames sind
**33 MB pro Layer**. Drei Raster-Layer mit voller Historie ≈ 100 MB — auf Mobilgeräten jenseits der
Schmerzgrenze. Das DACH-Komposit ist dagegen 600 × 512 = **307 KB**, also Faktor 4,3 günstiger.

**Empfehlung:** Ein **globaler** LRU-Puffer über alle Layer (nicht je Layer), Budget aus dem
statischen `FrameGovernor`-Tier abgeleitet: Desktop hoch 192 MB · Desktop/Tablet 96 MB · Mobil hoch
64 MB · Mobil niedrig 32 MB. Frames werden **auf dem Komposit-Gitter** gehalten, nicht auf den
Quellgittern, und nur für den sichtbaren Zeitbereich.

**Wichtig:** Der `FrameGovernor` bekommt **keine** neue Logik — er liefert nur sein Tier. D-09
(FrameGovernor als einziger Performance-Hebel, keine Sonderpfade) bleibt unangetastet.
**Gegenargument:** Ein globaler LRU kann einen selten genutzten Layer verhungern lassen. Gegenmittel:
Mindestkontingent je aktivem Layer (±2 Schritte um die aktuelle Stunde), das nie verdrängt wird.

### O-14 Umgang mit den Länder-Lücken — Empfehlung: **Lücken zeigen, amtliche Quelle verlinken, nie ersetzen**

**Ausgangslage:** Vier strukturelle Lücken, alle belegt: **AT** hat kein offenes Radar (Austro
Control publiziert nicht offen), **AT und CH** haben keine offenen Blitzdaten (ALDIS kommerziell,
MeteoSchweiz nicht publiziert), **AT** hat kein offenes Hagelprodukt, **CH** hat keine offenen
Warnungen und keinen offenen Nowcast (INCA-CH ist „Data on request").

| | **A — Layer für das Land ausblenden** | **B — Lücke zeigen + verlinken (empfohlen)** | **C — Modell-Ersatz einsetzen** |
|---|---|---|---|
| Ehrlichkeit (D-04) | ⚠️ Abwesenheit ist mehrdeutig | ✅ eindeutig | ❌ suggeriert Messung |
| Nutzen | keiner | Nutzer findet die Information | scheinbar hoch |
| Risiko | „keine Daten" liest sich wie „keine Gefahr" | keins | **falsche Sicherheit im sicherheitskritischen Feature** |
| Präzedenz | — | **V-17 hat genau das für Warnungen bereits getan** | widerspräche D-14 |

**Empfehlung: B**, konsequent für alle vier Lücken. Das ist die Fortsetzung von V-17 und nutzt die
bestehende, richtige Infrastruktur (`src/officialSources.ts` verlinkt bereits amtliche Stellen,
`src/avalanche.ts` ist das Vorbild „verlinken statt modellieren"). **Zusätzlich empfohlen:** die
Abdeckung als **Daten** im Layer-Deskriptor führen (`coverage`, `coverageNote`), damit ein Verifier
erzwingen kann, dass für jede Kombination Layer × Land entweder Abdeckung oder ein Hinweistext
existiert. Damit wird D-04 von einer Haltung zu einer Prüfbedingung.

**C ist ausdrücklich abzulehnen** — es ist derselbe Fehlertyp wie die erfundenen „78 %" (V-18) und
die Sim-Radar-Entscheidung, die mit D-15 bereits einmal zurückgenommen wurde.

---

## Entscheidungsvorlagen O-15 … O-19 (Spec-Session Zuglinien/Radar L5+L6, 2026-08-05)

> **Status: Vorlagen, keine Entscheidungen.** Erarbeitet in der Spezifikationssession zu den Phasen
> L5 (Zeitmodell + Playback) und L6 (Regenradar-Rückblick + Niederschlagszuglinien).
> Belegdokument: `docs/zuglinien-radar-spec.md`. **Die Entscheidung trifft ausschließlich Jan.**
> Jede Vorlage nennt den **Default**, der ohne Entscheidung gilt — die Implementierung ist also
> nicht blockiert, sie ist nur revidierbar.

### O-15 Bekommt auch `nowcast` eine Vergangenheitsachse? — Empfehlung: **nein**

**Ausgangslage:** L5 gibt dem Slider eine Vergangenheit; `rainradar` (L6) nutzt sie. Der bestehende
`nowcast`-Layer könnte technisch dasselbe tun — die Frames liegen im selben Session-Cache.

| | **A — `nowcast` bleibt 0…+N (empfohlen)** | **B — `nowcast` bekommt −60 min** |
|---|---|---|
| D-14 | unberührt | formal unberührt, faktisch aufgeweicht: „jetzt–2 h" stimmt dann nicht mehr |
| Nutzerklarheit | zwei Layer mit klarer Arbeitsteilung („jetzt & gleich" vs. „woher kam es") | ein Layer, der alles kann — und `rainradar` wird überflüssig |
| Aufwand | 0 | gering |
| Beschriftung | „Niederschlag · jetzt–2 h" bleibt wahr | müsste geändert werden ⇒ Änderung an einer von Jan getroffenen Entscheidung |

**Empfehlung: A.** Der Name des Layers ist Teil von D-14, und D-14 war ausdrücklich eine
Verkürzungs-Entscheidung („kürzer & ehrlicher"). Wer den Rückblick will, schaltet `rainradar` ein.
**Gegenargument, ehrlich benannt:** Zwei Niederschlags-Layer im selben Z-Band sind erklärungs-
bedürftig; O-12s weicher Ausschluss ist die Antwort darauf, aber keine schöne.
**Default ohne Entscheidung: A.**

### O-16 Später `precipSource.ts` in `layerTime.ts` auflösen? — Empfehlung: **frühestens nach L8**

**Ausgangslage:** L5 lässt `precipSource.ts` bewusst unverändert und ruft es aus `layerTime.ts` auf
(`docs/zuglinien-radar-spec.md` §3.6). Damit existieren zwei Zeitmodelle nebeneinander.

| | **A — Zustand belassen (empfohlen bis L8)** | **B — jetzt zusammenführen** |
|---|---|---|
| Byte-Identität | **konstruktiv** (kein Code geändert) | nur **geprüft** — der Verifier kann Fehler finden, nicht ausschließen |
| D-14 | in einer Modulgrenze kodifiziert | zu einer Konfigurationszeile degradiert |
| Konzeptuelle Sauberkeit | ⚠️ Doppelpflege (die `docs/MAP.md` §5 ohnehin schon als bewusst beschreibt) | ✅ ein Modell |
| Risiko | 0 | mittel, in der empfindlichsten Fläche des Produkts |

**Empfehlung: A bis L8.** Ab L8 existiert `verify:composite-equivalence` mit Red-Test-Nachweis;
dann ist die Zusammenführung risikoarm nachholbar. `verify:layer-time` prüft in der Zwischenzeit die
**Deckungsgleichheit** beider Modelle maschinell — die Doppelpflege kann also nicht still
auseinanderlaufen. **Default ohne Entscheidung: A.**

### O-17 Warm-Cron für den RV-Rückblick? — Empfehlung: **nein, erst nach A10/V-80**

**Ausgangslage:** Der DE-Rückblick braucht 12 RV-Tars (~8,8 MB kalt). Warm sind sie ohnehin da
(`RV_TAR_CACHE_MAX = 14`, `radolan.ts:169`), kalt kosten sie einen P4-Hintergrundlauf.

| | **A — kein Cron (empfohlen)** | **B — Warm-Cron erweitern** |
|---|---|---|
| Wirkung | Rückblick füllt sich in den ersten ~20 s nach dem Laden | erster Frame minimal schneller |
| Aufwand | 0 | Cron-/Budget-Zone ⇒ **STOPP & FRAGEN** |
| Konflikt | keiner | **A10 ist heute schon falsch geschnitten** (V-80) — mehr Warm-Last, bevor die bestehende Fehlallokation behoben ist, verschärft das Problem |

**Empfehlung: A.** Der Rückblick ist eine Komfortfunktion, kein Erstbild; er darf nachladen.
**Default ohne Entscheidung: A.**

### O-18 E3 (Zellbahnen) in L6 oder L11? — Empfehlung: **L11**

**Ausgangslage:** F-3 ist geschlossen (KONRAD3D-Schema am 2026-08-05 aus einer echten Datei
ausgelesen). E3 wäre damit **fachlich** sofort baubar.

| | **A — E3 bleibt L11 (empfohlen)** | **B — E3 in L6 ziehen** |
|---|---|---|
| „Ein Thema = eine Phase" | ✅ eingehalten | ❌ verletzt — L6 hätte drei Features und ein Gate |
| Datenpfad | eigener (Scrape, 0,6-MB-XML, DOM-freier Parser, Proxy) ⇒ eigene Phase gerechtfertigt | dieselbe Arbeit, nur ohne eigenes Gate |
| Ehrlichkeitsfläche | `hail_flag`, `gust_flag`, `maximum_estimated_wind_gust` lösen D-19 aus ⇒ eigenes §0-Kapitel im Gate | ginge im L6-Gate unter |
| Aufwand L6 | M (4–6 T) bleibt | L (9–14 T) — die Phase wird zur größten des ganzen Plans |
| Nutzerwert früher? | nein — E3 ohne E1/E2 ist wertlos, mit E1/E2 ist es additiv | ja, um ~1 Phase |

**Empfehlung: A.** Der einzige Grund für B wäre Ungeduld; der Preis wäre ein Gate, das drei
Features gleichzeitig freigibt — genau das Muster, das `CLAUDE.md` verbietet.
**Default ohne Entscheidung: A.**

### O-19 Shader-Crossfade freigeben? — Empfehlung: **später, nicht in L6**

**Ausgangslage:** L6 mischt zwei Uint8-Frames auf der CPU (`frameBlend.ts`, 307 200 Ops je
Tween-Frame). Ein Shader mit zwei Texturen und `mix()` wäre billiger und schöner — berührt aber die
WebGL-Pipeline und ist damit STOPP-&-FRAGEN-Zone (`CLAUDE.md`).

| | **A — CPU-Blend (empfohlen für L6)** | **B — Shader-`mix` im `RainLayer`** |
|---|---|---|
| Risiko | null (keine GL-Zeile) | Shader-Zone; der RGBA8-Packing-Pfad ist tabu, das Texturformat wird zur Laufzeit verhandelt (D-08) |
| Kosten | 1,5 M Ops/s bei 2× — im Rauschen des ohnehin laufenden Kompositor-Gathers | praktisch null |
| Mobil | der `FrameGovernor` schaltet den Tween auf Tier `low` ohnehin ab | auch auf schwachen Geräten tragbar |
| Prüfbarkeit | headless (`verify:motion-field` Assertion 8) | nur visuell |

**Empfehlung: A für L6, B als eigene, kleine Phase danach** — mit Real-Device-Nachweis, weil genau
hier die Emulation nicht aussagekräftig ist. **Default ohne Entscheidung: A.**

### Zusätzlich zur Kenntnis (keine Entscheidung nötig)

- **F-3 (KONRAD3D-Schema) ist geschlossen** (2026-08-05, aus `KONRAD3D_20260805T193500.xml`).
  KONRAD3D führt Zell-ID, Umriss-Polygon, `cell_speed`, **zwölf Prognose-Schwerpunkte mit
  amtlichen Unsicherheitsellipsen** (+5…+60 min), Hagel-/Böen-/Starkregen-Flags, VIL/VII, Echotops,
  Blitzrate und Mesozyklonen-Index. Damit ist der Pfadkegel für E3 **belegt statt geschätzt** und
  der Aufwand für L11 sinkt von 6–10 auf 5–8 Tage. Beleg: `docs/API.md` §2.4.
- **F-12 ist beantwortet:** Die GeoSphere-`grid`-Route sendet `Access-Control-Allow-Origin: *`
  (gemessen). Der Edge-Proxy bleibt trotzdem nötig — wegen des Rate-Limits (RK-4), nicht wegen CORS.
- **Neue offene Quellen-Frage F-13:** Die Klassen-Kodierung von `composite/hymecng`
  (ODIM `quantity = CLASS`) ist unbelegt; ohne sie kein Klassen-Layer (D-04). Blockiert L8/L9.
- **`vii` und `dmax` sind nicht mehr „Semantik unbelegt"** — ihre ODIM-Größen (`VII`+`VIL` bzw.
  `DBZH`) stehen in den Dateien. `composite/hg` bleibt draußen (4 Byte/Zelle belegt, physikalische
  Größe nicht), `composite/pg` ist BUFR und mangels Decoder außen vor.

---

### Zusätzlich zur Kenntnis (aus der Analyse-Session 2026-08-05)

- **V-133 ist gelöst.** Die `wtype`/`wlevel`-Legende der GeoSphere-Warn-API steht normativ in den
  Enum-Beschreibungen der amtlichen OpenAPI-Spezifikation
  (`https://openapi.hub.geosphere.at/warnapi/v1/openapi.json`): `1=Sturm, 2=Regen, 3=Schnee,
  4=Glatteis, 5=Gewitter, 6=Hitze, 7=Kälte` bzw. `1=gelb, 2=orange, 3=rot`. Zusätzlich liefert
  `getWarningsForCoords` deutschen Klartext (`text`, `auswirkungen`, `empfehlungen`) — es muss
  nichts geraten werden. **V-24 ist damit entblockt.**
- **Zwei Anfragen mit Wartezeit sollten sofort rausgehen** (blockieren Ausbaustufen, nicht den
  Kernumfang): EUMETSAT zur Lizenzstufe von Echtzeit-Bildprodukten (< 1 h Latenz) und EUMETNET zur
  Geltung von CC BY 4.0 für Nicht-Mitglieder bei den OPERA-Kompositen.
