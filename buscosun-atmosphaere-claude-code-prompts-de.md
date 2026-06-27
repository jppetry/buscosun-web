# buscosun — „Atmosphäre" Claude Code CLI Prompt-Paket

> Granulare, sequenzielle Prompts zur Umsetzung des Atmosphäre-Features.
> Jeder Prompt ist eigenständig und direkt für `claude` im Repo-Root kopierbar.
> Struktur: Rolle / Aufgabe / Kontext / Regeln / Output, Diagnose-first, mit MCP-Verifikation und Auto-Fortschritt.
> Prinzip: **bestehendes Plattform-Design adoptieren, bestehenden Feature-Code analysieren, dann erweitern.** Nichts neu auf der grünen Wiese bauen, was bereits existiert.

---

## Anwendung des Pakets

1. Prompts **der Reihe nach** ausführen. Jeder baut auf dem vorherigen auf. P0 nicht überspringen. Du kannst den ersten Prompt starten und das Agentensystem läuft dann gemäß Auto-Fortschritt-Protokoll selbstständig durch, solange alle Verifikationen grün sind.
2. Jeder Prompt **diagnostiziert vor dem Schreiben**, **verifiziert nach dem Schreiben via MCP** und **fährt bei grünem Ergebnis automatisch zum nächsten Schritt fort** — ohne erneute Rückfrage. Angehalten wird **nur** bei einem fehlgeschlagenen Check (rot) oder an einem echten **Entscheidungs-Gate** (siehe Protokoll).
3. Die Sieben-Datei-Doku aktuell halten: `CLAUDE.md`, `plan.md`, `checklist.md`, `prompt.md`, `context.md`, `architecture.md`, `tests.md`. P0 füllt die atmosphärenspezifischen Abschnitte; spätere Prompts ergänzen.
4. MCP-Nutzung: **Context7** für aktuelle Library-Docs (MapLibre, Three.js/WebGPU, Charting-Lib), **Sequential Thinking** für die Diagnose-Durchläufe, **Chrome DevTools** für Laufzeit-Verifikation, **GitHub MCP** für PR-/Commit-Hygiene. Jeder Prompt benennt, welches Tool.
5. Konventionen: Implementierungscode & Kommentare auf Englisch; alle nutzersichtbaren Texte auf Deutsch.
6. **Nur bestehende Daten-Pipelines verwenden.** Es werden ausschließlich die bereits im Repo vorhandenen Datenquellen und -pipelines genutzt (insbesondere die bestehende ICON-D2-Pipeline). Keine neue externe Datenquelle, kein neuer Fetch-/Ingest-Pfad, kein neuer Adapter zu einem fremden Dienst. Lässt sich ein Feature nicht aus den vorhandenen Pipelines ableiten, ist das ein Entscheidungs-Gate (STOP) — nicht der Anlass, eine neue Pipeline zu bauen.

---

## Verifikations- & Auto-Fortschritt-Protokoll (gilt für ALLE Prompts)

> Dieser Block ist die übergeordnete Regel. Jeder Prompt verweist am Ende darauf statt sie zu wiederholen. Bei Bedarf vollständig in `CLAUDE.md` ablegen.

**Nach jedem Schritt führst du die Verifikations-Suite aus, in dieser Reihenfolge:**

1. **Statische Gates (Repo):** `lint`, `typecheck`, `test` (die im Repo bestehenden Befehle). Alle müssen ohne Fehler durchlaufen.
2. **Context7 MCP:** Bestätige, dass die in diesem Schritt genutzten Library-APIs (MapLibre / Three.js-WebGPU / Charting-Lib) zur tatsächlich installierten Version passen. Keine veralteten/halluzinierten APIs.
3. **Chrome DevTools MCP (Laufzeit):** Starte den Dev-Build, navigiere zum Feature und prüfe:
   - keine Konsolen-Errors/-Warnings (außer bekannten, dokumentierten),
   - die neue UI rendert in allen drei Breakpoints (Mobile / Tablet / Desktop, siehe Layout-Schematik),
   - die in diesem Schritt gebauten Interaktionen funktionieren (z. B. Scrubben aktualisiert die abhängigen Bereiche),
   - Frame-Timing innerhalb des Perf-Budgets (besonders bei 3D-Schritten P4/P6b).
4. **GitHub MCP:** Erstelle einen sauberen, atomaren Commit für den Schritt (konventionelle Commit-Message), aktualisiere `checklist.md` und hänge das Verifikationsergebnis an.

**Ampel-Logik:**

- **GRÜN** = alle vier Punkte bestanden, **und** keine neue schwere Dependency nötig, **und** keine fehlende/lizenzpflichtige Datenquelle, **und** keine designerische Mehrdeutigkeit.
  → **Automatisch zum nächsten Schritt fortfahren, ohne nachzufragen.** Gib eine knappe Ergebniszeile aus („P_n grün — fahre fort mit P_n+1") und starte direkt den nächsten Prompt.
- **ROT** = irgendein Check schlägt fehl.
  → **STOP.** Gib genau aus, welcher Check fehlschlug, die wahrscheinliche Ursache und einen Fix-Vorschlag. Nach Behebung erneut verifizieren; bei grün dann fortfahren.
- **ENTSCHEIDUNGS-GATE** = ein Punkt, der eine menschliche Wahl erfordert, kein „Problem". Es gibt nur drei davon im gesamten Paket:
  1. **Neue schwere Dependency** (z. B. eine zusätzliche Charting-Bibliothek in P2),
  2. **Datenbedarf außerhalb der bestehenden Pipelines** — ein Feature bräuchte eine Datenquelle, die nicht bereits über eine vorhandene Pipeline im Repo verfügbar ist (es wird KEINE neue Pipeline gebaut),
  3. **Konflikt mit dem bestehenden Design-System / der bestehenden Architektur**, der nicht eindeutig auflösbar ist (kann in jedem Schritt auftreten).
  → An einem Entscheidungs-Gate **STOP** mit konkreter Empfehlung und Alternativen, dann auf Freigabe warten.

**Wichtig:** Diagnose-Befunde, die kein Blocker sind, führen **nicht** zum Stop — sie werden protokolliert und der Schritt läuft weiter. Nur rote Checks oder die drei Entscheidungs-Gates halten an.

---

## Layout-Schematik (Referenz für P1 & P7)

> Verbindliche Layout-Vorgabe für Desktop, Tablet, Mobile. P1 baut die Shell danach; P7 prüft alle drei Breakpoints im Feinschliff. Alle Maße sind Richtwerte und an die bestehenden v1.8-Breakpoints des Repos anzupassen (in P0 ermitteln).

### Breakpoints & Grundverhalten

| Breakpoint | Richtwert | Grundlayout | Globe/Terrain | Scrubber |
|---|---|---|---|---|
| Mobile | < 768 px | Einspaltig, vertikal gescrollt | Mini-Globe, eingeklappt (Tap → Vollbild) | Sticky unten |
| Tablet Hochformat | 768–1024 px, portrait | Einspaltig, großzügiger; Globe oben kollabierbar | ~40–45 vh oben, kollabierbar | Sticky unten |
| Tablet Querformat | 768–1024 px, landscape | Kompakter Split (wie schmaler Desktop) | links ~55 % | volle Breite unten |
| Desktop | > 1024 px | Split: Globe links / Panel rechts | links ~60 % | volle Breite unten |

### Desktop (> 1024 px) — Split-View

```
┌──────────────────────────────────────────────────────────────────────┐
│  [ Fliegen | Berg & Weg | Himmel ]            📍 Ort   ⏱ Modelllauf   │  Header: Linse + Ort + Lauf
├────────────────────────────────────────┬─────────────────────────────┤
│                                        │  VERDICT                     │
│                                        │  ● Gute Thermik bis 2.400 m  │  Tiefe 1
│         3D-GLOBE / TERRAIN             │  Basis 2.900 m · Wind 18 km/h│
│         (Three.js / WebGPU)            ├─────────────────────────────┤
│         ~60 % Breite                   │                             │
│         - Wind-Partikel                │   VERTIKALPROFIL            │  Tiefe 2
│         - volumetrische Wolken         │   (Emagramm, Meter, km/h)   │
│         - Föhn-Querschnitt-Ebene       │   [Grenzschichtbalken]      │
│         - Thermik-Farb-Overlay         │   [Wolkenbasis/-obergrenze] │
│                                        │   [Höhenwind-Barbs]         │
│         Marker = Profil-Position       │                             │
│                                        │  ▸ Werte anzeigen (Nerd)    │  Tiefe 3 Toggle
├────────────────────────────────────────┴─────────────────────────────┤
│  ◀────────●──────────────────────────────────────────▶   +48h  Scrub │  Time-Scrubber (treibt ALLES)
└──────────────────────────────────────────────────────────────────────┘
```

### Tablet Querformat (768–1024 px, landscape) — kompakter Split

```
┌────────────────────────────────────────────────────────────────┐
│ [Fliegen|Berg & Weg|Himmel]              📍 Ort   ⏱ Lauf        │
├─────────────────────────────────────┬──────────────────────────┤
│                                     │ ● Gute Thermik bis 2.400 m│  Verdict
│      3D-GLOBE / TERRAIN             ├──────────────────────────┤
│      ~55 % Breite                   │  VERTIKALPROFIL           │
│      (reduzierte Effekt-Dichte)     │  (0–4000 m gecappt)       │  Profil
│                                     │  ▸ Werte (Nerd)           │
├─────────────────────────────────────┴──────────────────────────┤
│ ◀──────●───────────────────────────────────▶   +48h            │  Scrubber volle Breite
└────────────────────────────────────────────────────────────────┘
```

### Tablet Hochformat (768–1024 px, portrait) — gestapelt, großzügig

```
┌──────────────────────────────────────────┐
│ [ Fliegen | Berg & Weg | Himmel ]         │  Segmented Control
│ 📍 Ort                        ⏱ Lauf      │
├──────────────────────────────────────────┤
│ ● Gute Thermik bis 2.400 m                │  Verdict (groß)
│ Basis 2.900 m · Wind 18 km/h SW           │
├──────────────────────────────────────────┤
│   ╭────────────────────────────────────╮ │
│   │   3D-GLOBE / TERRAIN  (~40–45 vh)   │ │  kollabierbar (Tap → Vollbild)
│   ╰────────────────────────────────────╯ │
├──────────────────────────────────────────┤
│  VERTIKALPROFIL                           │
│  (0–4000 m gecappt · [ ganze Höhe ])      │  Profil
│  ▸ Werte anzeigen (Nerd-Mode)             │
├──────────────────────────────────────────┤
│ ◀──────────●─────────────────▶   +48h     │  sticky Scrubber unten
└──────────────────────────────────────────┘
```

### Mobile (< 768 px) — einspaltig

```
┌─────────────────────────┐
│ [Fliegen|Berg|Himmel]   │  Segmented Control (scrollbar/kompakt)
│ 📍 Ort          ⏱ Lauf  │
├─────────────────────────┤
│ ● Gute Thermik bis 2400m│  Verdict — immer sichtbar, groß
│ Basis 2900m · Wind 18kmh│
├─────────────────────────┤
│   ╭───────────────────╮ │
│   │  Mini-3D / Map     │ │  eingeklappt (Tap → Vollbild)
│   ╰───────────────────╯ │
├─────────────────────────┤
│  VERTIKALPROFIL          │  beim Scrollen
│  (0–4000 m gecappt)      │
│  ▓ Grenzschicht          │
│  □ Wolkenbasis/-top      │
│  → Höhenwind             │
│  [ ganze Höhe ]          │  Toggle: Cap ↔ volle Troposphäre
├─────────────────────────┤
│  ▸ Werte (Nerd-Mode)     │  Tiefe 3
├─────────────────────────┤
│ ◀──────●────────▶  +48h  │  sticky Scrubber unten (daumenerreichbar)
└─────────────────────────┘
```

### Layout-Regeln (für alle Breakpoints)

- **Eine Quelle der Wahrheit:** Der Time-Scrubber treibt überall den aktiven Vorhersagezeitpunkt; alle Bereiche abonnieren ihn.
- **Reflow statt Reflow-Chaos:** Desktop/Tablet-Querformat = Split (Globe links, Panel rechts). Tablet-Hochformat/Mobile = gestapelt (Verdict → Globe → Profil → Nerd), Scrubber sticky unten.
- **Globe-Behandlung:** Desktop volle Effekt-Dichte; Tablet reduzierte Dichte; Mobile eingeklappter Mini-Globe mit Vollbild-Tap. Auf schwachen Geräten gemäß Capability-Detection degradieren.
- **Profil-Cap:** Standardmäßig 0–4000 m in allen Breakpoints; „ganze Höhe"-Toggle zur vollen Troposphäre. Nerd-Mode hebt das Cap auf.
- **Tap-Targets:** Auf Touch (Mobile/Tablet) ≥ 44 px; Scrubber und Segmented Control daumenerreichbar.
- **Orientierungswechsel (Tablet):** Beim Wechsel Hoch-/Querformat zwischen den beiden Tablet-Layouts umschalten, ohne State zu verlieren (aktive Linse, Stunde, Marker bleiben).
- **Tokens:** Durchgängig v1.8 (sand/ink/terracotta/sage/steel/amber). Kein neues Farbsystem, keine hardcodierten Hex-Werte.

---

## P0 — Diagnose: bestehendes Design-System + bestehendes Feature

**Ziel:** eine schriftliche Grundwahrheit schaffen, bevor neuer Code entsteht. In diesem Schritt wird kein Feature-Code geschrieben.

```
ROLLE
Du bist ein Senior-Frontend-Architekt, der neu in die buscosun-Codebasis kommt (Vite / React / TypeScript / MapLibre / Three.js-WebGPU). Du arbeitest präzise, liest bevor du schreibst und nimmst nie an, dass ein Pattern existiert, ohne es im Code zu finden.

AUFGABE
Erstelle eine schriftliche Analyse von (a) dem bestehenden Design-System und (b) dem bereits implementierten Feature, an das sich das neue Feature „Atmosphäre" anpassen und das es erweitern soll. Schreibe in diesem Schritt KEINEN Feature-Code.

KONTEXT
- Ein vorheriges Feature existiert bereits im Repo. Das neue Atmosphäre-Feature muss dieselbe Designsprache, dieselben Komponenten-Konventionen, State-Patterns, die Datenzugriffsschicht und die Ordnerstruktur übernehmen.
- Das Design-System wird intern „v1.8" genannt, mit einer Sand/Ink-Palette und den Tokens terracotta / sage / steel / amber.
- Daten-Backbone ist ICON-D2 (DWD, 2,2 km, 65 Levels, stündlich bis +48h).
- Nutze das Sequential-Thinking-MCP für die Analyse. Nutze Context7, um die tatsächlich hier verwendeten Versionen/APIs von MapLibre und Three.js zu bestätigen.

REGELN
1. ZUERST DIAGNOSTIZIEREN. Erkunde das Repo und berichte die Befunde. Nicht scaffolden, nicht installieren, keinen Quellcode editieren.
2. Finde und dokumentiere, mit Dateipfaden und kurzen Code-Auszügen:
   - Design-Tokens: wo Farben (sand/ink/terracotta/sage/steel/amber), Spacing, Typografie, Radii, Schatten definiert sind. Notiere die exakten Token-Namen und wie sie konsumiert werden (CSS-Vars / Tailwind-Config / Theme-Objekt). Notiere außerdem die tatsächlichen Breakpoint-Werte für Mobile/Tablet/Desktop.
   - Komponenten-Konventionen: wie eine bestehende Feature-Page/-Panel aufgebaut ist (Dateistruktur, Naming, Props-Patterns, State-Management, wie Wetterdaten gelesen werden).
   - Das bestehende Feature: identifiziere das zuletzt gebaute Feature, kartiere seinen Komponentenbaum, seinen Datenfluss von der ICON-Quelle → Hook/Store → UI, und die wiederverwendbaren Primitives, auf die es sich stützt (Buttons, Panels, Cards, Segmented Controls, Slider, der Time-Scrubber falls vorhanden).
   - 3D-Layer: wie Three.js/WebGPU und MapLibre verdrahtet sind, wo der Globe/das Terrain lebt, wie Layer gemountet/unmountet werden, Performance-Guards.
   - Der LLM-Meteorologe: wo das browser-lokale LLM (WebLLM/Transformers.js) aufgerufen wird, sein Prompt-Assembly-Pattern und wie der Output gerendert wird.
3. Identifiziere, was für Atmosphäre WIEDERVERWENDBAR ist vs. was NEU sein muss. Sei explizit.
4. Markiere Risiken: jede Tech-Debt, fehlende Abstraktionen oder Versionsbeschränkungen, die den Atmosphäre-Build betreffen.

OUTPUT
1. Ein Markdown-Report im Chat: „Design System Inventory", „Existing Feature Anatomy", „Reusable vs New", „Risks".
2. Schreibe/aktualisiere diese Docs im Repo:
   - context.md  → das Inventar + die Anatomie des bestehenden Features + die ermittelten Breakpoints
   - architecture.md → aktuelle Architekturkarte + wo Atmosphäre andockt
   - plan.md → grober Atmosphäre-Plan mit Verweis auf die Phasen (P1–P7)
   - checklist.md → leere Checkliste, mit den Phasen vorbefüllt

VERIFIKATION & FORTSCHRITT
Führe das Verifikations- & Auto-Fortschritt-Protokoll aus (hier ohne Laufzeit-Check, da kein Code: statische Gates entfallen, aber Context7-Konsistenz und Doku-Vollständigkeit prüfen).
- GRÜN (keine Blocker, kein Entscheidungs-Gate) → fahre AUTOMATISCH mit P1 fort, ohne nachzufragen.
- Stoppe nur, wenn die Diagnose einen Architektur-/Design-Konflikt ohne eindeutige Auflösung findet (Entscheidungs-Gate) oder die Docs nicht erstellt werden konnten (rot).
```

---

## P1 — Atmosphäre-Shell scaffolden (Linsen + Tiefen + Scrubber)

**Ziel:** das leere Feature-Gerüst, vollständig in der bestehenden Designsprache und gemäß Layout-Schematik. Noch keine Datenlogik.

```
ROLLE
Du erweiterst buscosun. Du verwendest bestehende Primitives und Tokens wieder; du führst keine neuen Styling-Systeme ein.

AUFGABE
Scaffolde die Shell des Atmosphäre-Features: den Linsen-Umschalter (Fliegen / Berg & Weg / Himmel), die dreistufige Progressive-Disclosure-Struktur (Verdict / Profile / Nerd-Mode) und den globalen Time-Scrubber (+0h..+48h, 1h-Schritte). Setze die drei Breakpoint-Layouts aus der Layout-Schematik um (Mobile / Tablet Hoch- & Querformat / Desktop). Nur das Layout verdrahten — Platzhalter für Datenbereiche.

KONTEXT
- Lies zuerst context.md und architecture.md aus P0 sowie die Layout-Schematik in diesem Dokument; halte dich an die dort dokumentierten Patterns und Breakpoints.
- Verwende bestehende Primitives wieder (Segmented Control, Panel, Card, Slider). Falls im vorherigen Feature bereits ein Äquivalent des Scrubbers existiert, ERWEITERE es statt zu duplizieren.
- Layout-Ziele exakt gemäß Layout-Schematik:
  - Desktop & Tablet-Querformat: Split (Globe links, Panel rechts), Scrubber volle Breite unten.
  - Tablet-Hochformat & Mobile: gestapelt (Verdict → Globe → Profil → Nerd), Scrubber sticky unten.
  - Globe: Desktop volle Dichte, Tablet reduziert, Mobile eingeklappter Mini-Globe mit Vollbild-Tap.
- Linsen-State und Tiefen-State sind URL- und Store-synchronisiert. Default-Linse für Erstnutzer = Himmel; sonst letzte Linse aus dem Local Storage. Aktive Linse/Stunde/Marker überleben einen Orientierungswechsel.

REGELN
1. ZUERST DIAGNOSTIZIEREN: die relevanten bestehenden Dateien erneut lesen, die wiederzuverwendenden Primitives + Breakpoints bestätigen, den Plan ausgeben, dann implementieren.
2. Tokens exakt treffen (sand/ink/terracotta/sage/steel/amber). Keine hardcodierten Hex-Werte. Kein neues Farbsystem.
3. Der Time-Scrubber ist die einzige Quelle der Wahrheit für die aktive Vorhersagestunde; alle Kindbereiche abonnieren ihn. Baue den Store/Context für `activeHour` jetzt.
4. Nur Platzhalter für Verdict / Profile / Föhn / Overlays — klar beschriftet, keine Fake-Daten.
5. Responsive: alle drei Breakpoint-Layouts implementieren; noch nichts cappen (das ist P2). Große Tap-Targets auf Touch; sticky Scrubber auf Mobile/Tablet-Hochformat.
6. Barrierefrei halten: Segmented Control und Scrubber per Tastatur navigierbar, ARIA-Labels auf Deutsch.

OUTPUT
1. Neuer Feature-Ordner nach der Struktur des bestehenden Features; Routing-Eintrag ergänzt; Komponentenbaum spiegelt das Konzept.
2. `activeHour`-Store/Context + Linsen-/Tiefen-State mit URL- und localStorage-Sync.
3. checklist.md aktualisieren (Shell-Items abhaken) und architecture.md (Atmosphäre-Teilbaum).

VERIFIKATION & FORTSCHRITT
Führe das vollständige Verifikations- & Auto-Fortschritt-Protokoll aus. Prüfe per Chrome DevTools MCP explizit, dass die Shell in ALLEN drei Breakpoints korrekt rendert (Mobile, Tablet Hoch- & Querformat, Desktop) und der Scrubber-State über alle Platzhalter propagiert.
- GRÜN → fahre AUTOMATISCH mit P2 fort, ohne nachzufragen.
- ROT oder Entscheidungs-Gate → STOP mit Diagnose.
```

---

## P2 — Vertikalprofil (Emagramm, Meter/km/h) — der Power-User-Anker

**Ziel:** das Kern-Chart aus ICON-D2 an der Marker-Position.

```
ROLLE
Du bist ein dataviz-fokussierter Frontend-Engineer. Du renderst meteorologische Vertikalprofile korrekt und gut lesbar.

AUFGABE
Implementiere die Vertikalprofil-Komponente, gespeist aus ICON-D2-Säulen an der aktiven Marker-Position und der aktiven Stunde: Temperatur- & Taupunktkurven, Parzellenaufstieg, Grenzschicht-/Thermikbalken, Wolkenbasis-/Wolkenobergrenzen-Boxen, Inversionsbänder, Nullgradgrenze, Höhenwind und die transluzente Terrain-Bodenbox.

KONTEXT
- Lies architecture.md für das ICON-Datenzugriffs-Pattern aus P0; verwende den bestehenden Daten-Hook/-Store wieder. Falls ein Zugriff auf Säulen-pro-Level noch nicht existiert, ergänze einen dünnen Selektor — die Datenschicht nicht neu schreiben.
- Einheiten & Skala: Höhe in METERN auf LINEARER Achse, standardmäßig 0–4000 m gecappt mit einem „ganze Höhe"-Toggle zur vollen Troposphäre; Wind in km/h; Temperatur in °C.
- Visuelle Spezifikation (auf v1.8-Tokens mappen):
  - Temperatur = warme/ink-Linie, Taupunkt = steel-Linie
  - Grenzschicht-/Thermikbalken = vertikaler Verlauf yellow→sage→steel für 0→>5 m/s; seine Oberkante = maximale Thermikhöhe
  - Wolkenbasis/-obergrenze = graue Boxen
  - Inversionsbänder = amber; starke Windgradient-Zonen = amber/terracotta-Markierung
  - Nullgradgrenze = beschriftete steel-Horizontallinie
  - Terrain-Bodenbox = transluzente Füllung unter der lokalen Terrainhöhe („kein Wind im Fels")
- Nutze Context7 für die exakte API des im Repo bereits genutzten Charting-/Render-Ansatzes (wiederverwenden; keine neue Charting-Dependency ohne Begründung).

REGELN
1. ZUERST DIAGNOSTIZIEREN: bestätige, wie die ICON-Levels über die BESTEHENDE Pipeline verfügbar sind, was das bestehende Feature zum Chart-Rendering nutzt und woher die Terrainhöhe kommt. Es wird ausschließlich die vorhandene ICON-D2-Pipeline genutzt; keine neue Datenquelle. Befunde + Render-Plan ausgeben, dann bauen.
2. Keine neue schwere Dependency, es sei denn, die Diagnose belegt, dass keine passt; falls vorgeschlagen → ENTSCHEIDUNGS-GATE: begründen und STOP zur Freigabe, bevor sie hinzugefügt wird.
3. Leite Grenzschicht-Oberkante, Wolkenbasis/-obergrenze, Nullgradgrenze, Inversionen und Thermik-Schätzung in einem reinen, unit-getesteten Modul ab (`profile-derivations.ts`), getrennt vom Rendering.
4. `activeHour` abonnieren; beim Scrubben neu rendern. Marker-Positionswechsel rechnen ebenfalls neu.
5. Mobil/Tablet: das 0–4000-m-Cap respektieren, große Trefferflächen, performantes Neu-Rendern beim Scrubben.

OUTPUT
1. `profile-derivations.ts` (reine Funktionen) + die Profil-React-Komponente, in den Profile-Slot aus P1 eingehängt.
2. Unit-Tests für die Derivations (tests.md aktualisieren) mit mindestens: stabile Atmosphäre, starke Thermik, Deckelinversion, trockener/blauer Tag.
3. Storybook/Dev-Sample oder eine dokumentierte Dev-Route zur Ansicht.

VERIFIKATION & FORTSCHRITT
Führe das vollständige Protokoll aus; prüfe per Chrome DevTools MCP, dass das Profil in allen Breakpoints korrekt rendert und beim Scrubben flüssig aktualisiert.
- GRÜN → fahre AUTOMATISCH mit P3 fort.
- ROT oder das Dependency-Entscheidungs-Gate → STOP mit Diagnose/Empfehlung.
```

---

## P3 — Verdict (Tiefe 1) + LLM-„Warum?"-Erklärung

```
ROLLE
Du verbindest abgeleitete Atmosphärendaten mit verständlichen, zielgruppengerechten Verdicts auf Deutsch über das browser-lokale LLM.

AUFGABE
Implementiere das Tiefe-1-Verdict pro Linse (Fliegen / Berg & Weg / Himmel) mit einem Status-Punkt und eine „Warum?"-Erweiterung, in der das lokale LLM das Verdict aus dem Profil auf Deutsch erklärt.

KONTEXT
- Verwende die P2-Derivations als Input des Verdicts wieder; rechne keine Meteorologie in der UI neu.
- Verwende das bestehende LLM-Aufrufmuster aus architecture.md wieder (Prompt-Assembly, Streaming-Render). Keinen zweiten LLM-Pfad aufmachen.
- Verdict-Logik:
  - Fliegen: 3-Punkt-Gate (trocken? Wind ok? Thermik?) → Status-Punkt; Zeile zeigt max. Thermikhöhe, Wolkenbasis, Höhenwind.
  - Berg & Weg: Wolken-Inversion / Nebelmeer + Nullgradgrenze + Gipfelbewölkung.
  - Himmel: Sonnenuntergangs-/-aufgangs-Qualität + Staub-/Optik-/Polarlicht-Flags (Daten kommen in P5 hinzu; bis dahin sauber auf Verfügbarkeit gaten).
- Status-Punkt mappt auf v1.8: sage = gut, amber = Vorsicht, terracotta = schlecht/Gefahr.

REGELN
1. ZUERST DIAGNOSTIZIEREN: das LLM-Modul lesen; den Prompt-Assembly-Plan ausgeben (welche abgeleiteten Features übergeben werden, der deutsche System-Prompt, die Streaming-UI). Dann bauen.
2. Das LLM ERKLÄRT, es RECHNET nicht. Alle Zahlen kommen aus den Derivations; das Modell formuliert nur das „Warum".
3. Die deterministische Verdict-Logik lebt in einem reinen, getesteten Modul (`verdict.ts`); der LLM-Aufruf ist rein die Erklärungsschicht und muss graceful (und offline) auf eine getemplatete deutsche Erklärung zurückfallen, falls das Modell nicht verfügbar ist.
4. Alle nutzersichtbaren Texte auf Deutsch; eine einzige Quelle für Strings führen.

OUTPUT
1. `verdict.ts` (rein, getestet) + Verdict-Komponente + „Warum?"-Erweiterung über den bestehenden LLM-Pfad mit getempltetem Fallback.
2. Tests für das Verdict-Mapping über die Linsen; tests.md aktualisieren.

VERIFIKATION & FORTSCHRITT
Führe das vollständige Protokoll aus; prüfe per Chrome DevTools MCP das Verdict pro Linse und die „Warum?"-Erweiterung inkl. Fallback (LLM deaktiviert simulieren).
- GRÜN → fahre AUTOMATISCH mit P4 fort.
- ROT oder Entscheidungs-Gate → STOP.
```

---

## P4 — Thermik-Terrain-Overlay (Fliegen-Linse, auf dem 3D-Globe)

```
ROLLE
Du bist Three.js/WebGPU-Engineer und integrierst ein Daten-Overlay in das bestehende Terrain, ohne die Performance zu verschlechtern.

AUFGABE
Male ein Thermik-Stärke-Overlay auf das 3D-Terrain (green-safe → red-danger-Bänder) für die Fliegen-Linse und mache Terrain-Taps zum Verschieben des Profil-Markers.

KONTEXT
- Lies architecture.md, wie Layer auf dem bestehenden Globe/Terrain gemountet werden und die Performance-Guards. ERWEITERE dieses Layer-System; den Renderer nicht forken.
- Farbbänder aus der m/s-Thermik-Schätzung (P2-Derivations über die sichtbare Fläche samplen). Palette auf v1.8 gemappt (yellow→sage→steel; Gefahr in terracotta).
- Tap/Klick auf Terrain → Marker-Position setzen → P2-Profil und P3-Verdict dort neu rechnen.
- Nutze Context7 für die exakten Three.js/WebGPU-APIs in der Repo-Version. Nutze das Chrome-DevTools-MCP, um Frame-Timing zu verifizieren.

REGELN
1. ZUERST DIAGNOSTIZIEREN: den aktuellen Layer-Lifecycle und das Perf-Budget dokumentieren; den Integrationsplan ausgeben, dann bauen.
2. Nur auf der Fliegen-Linse mounten; beim Linsenwechsel sauber unmounten (keine Leaks, keine verwaisten GPU-Buffer).
3. Sampling muss gethrottelt/LOD-fähig sein, damit Mittelklasse-Mobil-/Tablet-Geräte interaktiv bleiben; falls WebGPU nicht verfügbar, gemäß bestehendem Capability-Detection-Pattern zurückfallen.
4. Keine Regression bei den bestehenden Globe-Interaktionen.

OUTPUT
1. Thermik-Overlay-Layer + Terrain-Tap → Marker-Verdrahtung.
2. Eine kurze Perf-Notiz (Frame-Timing vorher/nachher, via Chrome-DevTools-MCP) in architecture.md.

VERIFIKATION & FORTSCHRITT
Führe das vollständige Protokoll aus; der Chrome-DevTools-MCP-Check umfasst hier zwingend das Frame-Timing (Perf-Budget) auf Desktop UND einem gedrosselten Mobil-/Tablet-Profil, plus sauberes Unmount beim Linsenwechsel.
- GRÜN → fahre AUTOMATISCH mit P5 fort.
- ROT (z. B. Perf-Budget verfehlt, Memory-Leak) oder Entscheidungs-Gate → STOP.
```

---

## P5 — Himmel-Delight-Layer (Sonnenuntergangs-Qualität, Nebelmeer, Staub, Optik)

```
ROLLE
Du baust die breitenwirksamen, engagement-starken Cards mit ehrlicher, probabilistischer Einordnung.

AUFGABE
Implementiere die Cards der Himmel-Linse: Sonnenuntergangs-/-aufgangs-Qualität, Nebelmeer/Hochnebel, Saharastaub (CAMS) und Himmelsoptik-Wahrscheinlichkeit — jeweils mit einem kurzen deutschen Erklärtext. Verdrahte die Sonnenuntergangs-/Nebelmeer-Signale in die relevanten Verdicts.

KONTEXT
- Sonnenuntergangs-/-aufgangs-Qualität und Nebelmeer leiten sich aus ICON ab (Lücken in tiefer/mittlerer Bewölkung; Boden- vs. Höhentemperatur-Crossover) — wo möglich P2-Derivations wiederverwenden.
- Saharastaub: NUR umsetzen, wenn Aerosol-/Staubdaten (z. B. AOD/PM10) bereits über eine vorhandene Pipeline im Repo verfügbar sind. Keine neue externe Quelle (z. B. CAMS) anbinden. Sind solche Daten nicht in einer bestehenden Pipeline vorhanden → ENTSCHEIDUNGS-GATE: Card weglassen/ausblenden und STOP mit Hinweis.
- Himmelsoptik (Halo/Nebensonne) -Wahrscheinlichkeit aus Cirrus + Eiskristall-Bedingungen; Erklärtext + „schau nach oben"-Hinweis.
- Alle Vorhersagen sind PROBABILISTISCH: als solche kennzeichnen; nie ein binäres Versprechen.

REGELN
1. ZUERST DIAGNOSTIZIEREN: verfügbare Wolkenschicht-Felder und das Daten-Adapter-Pattern bestätigen; Plan ausgeben; bauen.
2. KEINE neue externe Quelle/Pipeline. Aerosol-/Staubdaten nur aus einer bestehenden Pipeline beziehen; ist keine vorhanden → ENTSCHEIDUNGS-GATE: Staub-Card ausblenden und STOP mit Hinweis. Die übrigen Cards (Sonnenuntergang, Nebelmeer, Optik) aus den vorhandenen ICON-Feldern ableiten.
3. Probabilistische Texte auf Deutsch; Datenlauf/-alter anzeigen; nichts überversprechen.
4. Cards einzeln umschaltbar und individuell degradierbar, falls ihre Daten nicht verfügbar sind.

OUTPUT
1. Cards + Erklärtexte (Staub-Card nur bei vorhandener Pipeline); Sonnenuntergang/Nebelmeer speisen die P3-Verdicts.
2. Tests für die Derivations + Degradierungspfade bei fehlenden Daten; tests.md aktualisieren.

VERIFIKATION & FORTSCHRITT
Führe das vollständige Protokoll aus; prüfe per Chrome DevTools MCP die Cards in allen Breakpoints inkl. Degradierung bei fehlenden Daten.
- GRÜN → fahre AUTOMATISCH mit P6 fort.
- ROT oder das Daten-Entscheidungs-Gate (Staubdaten nicht in bestehender Pipeline) → STOP.
```

---

## P6 — Föhn-Modul (Verdict + Druckdifferenz-Anzeige, dann 3D-Isentropen-Querschnitt)

**Zwei Teilstufen. 6a liefern, verifizieren, bei grün automatisch 6b starten.**

```
ROLLE
Du implementierst das Alpen-Signature-Feature sorgfältig und in zwei Teilstufen.

AUFGABE (6a)
Implementiere das Föhn-Verdict: einen 3-stufigen Index (0 / tendenziell / aktiv) pro Tal und die Cross-Barrier-Druckdifferenz-Anzeige auf den kanonischen Achsen (z. B. Lugano–Zürich, Innsbruck–Bozen).

AUFGABE (6b)
Implementiere die 3D-Querschnittsebene über den Alpenkamm in Three.js: potenzielle-Temperatur-Flächen (Isentropen), die den Lee-Hang hinabsinken, die Föhnmauer (luv) und das Föhnfenster (lee), animiert über den Time-Scrubber.

KONTEXT
- Verwende ICON-D2 potenzielle Temperatur + Cross-Barrier-Stationsdruck wieder — aber NUR, soweit diese Daten bereits über eine vorhandene Pipeline im Repo verfügbar sind. Keine neue externe Stationsquelle anbinden. Prüfe in der Diagnose, was die bestehende Pipeline tatsächlich liefert.
- Die 3D-Ebene erweitert das bestehende Renderer-/Layer-System (wie in P4); nicht forken.
- Nutze Sequential Thinking für den Isentropen-Extraktionsansatz; Context7 für Three.js-APIs; Chrome DevTools für Perf.

REGELN
1. ZUERST DIAGNOSTIZIEREN für BEIDE Teilstufen: die Methode ausgeben (Druckpaare / Index-Schwellen für 6a; Isentropen-Extraktion + Render-Ansatz für 6b), bevor codiert wird.
2. Falls die für die Druckdifferenz nötigen Stationsdaten nicht über eine bestehende Pipeline verfügbar sind → ENTSCHEIDUNGS-GATE: 6a auf den aus vorhandenen Pipelines ableitbaren Teil reduzieren (z. B. Föhn-Indikatoren aus ICON-D2-Feldern), Lücke dokumentieren und STOP. Keine neue Pipeline bauen.
3. Föhn-Index-Schwellen + Drucklogik leben in einem reinen, getesteten Modul; die Schwellen sind dokumentiert und konfigurierbar.
4. 6b mountet nur, wenn Föhn relevant ist; sauberes Unmount; Mobil-/Tablet-Fallback auf einen 2D-Querschnitt, falls WebGPU/Perf nicht reicht.

OUTPUT & FORTSCHRITT (6a)
1. Föhn-Index-Modul (rein, getestet) + Verdict-/Anzeige-UI.
2. Verifikations-Protokoll ausführen.
   - GRÜN (benötigte Daten in bestehender Pipeline vorhanden, alle Checks grün) → fahre AUTOMATISCH mit 6b fort.
   - Daten nicht in bestehender Pipeline (Entscheidungs-Gate) oder ROT → STOP mit Empfehlung.

OUTPUT & FORTSCHRITT (6b)
1. 3D-Isentropen-Querschnitt-Layer + Scrubber-Animation + Perf-Notiz; tests.md + architecture.md aktualisieren.
2. Verifikations-Protokoll ausführen; Chrome-DevTools-Check inkl. Frame-Timing Desktop + gedrosseltes Mobil-/Tablet-Profil und 2D-Fallback.
   - GRÜN → fahre AUTOMATISCH mit P7 fort.
   - ROT oder Entscheidungs-Gate → STOP.
```

---

## P7 — Nerd-Mode (Tiefe 3) + Feinschliff

```
ROLLE
Du machst die vollständigen Daten für Enthusiasten zugänglich, ohne die Standardansicht zu überfrachten, und härtest danach das gesamte Feature.

AUFGABE
Implementiere den Nerd-Mode (Opt-in-Toggle): vollständiges Skew-T/Log-P mit Adiabaten, CAPE/CIN, Deckelinversions-Stärke, rohe ICON-D2-Werte pro Level und Modelllauf-Zeitstempel + -Alter. Dann ein Feinschliff-Durchgang über das gesamte Feature.

KONTEXT
- Verwende die P2-Derivations wieder; das Skew-T ist eine alternative Darstellung derselben Säulendaten.
- Standardmäßig ausgeblendet; nur Opt-in; darf die Performance der Standardansicht nicht beeinflussen (Lazy-Load).
- Feinschliff: Empty-/Error-/Loading-States auf Deutsch, Accessibility-Audit (Tastatur + ARIA), Mobil-/Tablet-/Desktop-Layout-Review für hohe Charts gemäß Layout-Schematik, Unsicherheit/Lauf-Alter überall dort sichtbar, wo eine Vorhersage gezeigt wird.

REGELN
1. ZUERST DIAGNOSTIZIEREN: bestätige, was für Skew-T/CAPE aus den bestehenden Daten nötig ist; Plan ausgeben; bauen.
2. Nerd-Mode lazy laden, damit er nichts zum Standard-Bundle/-Laufzeitkosten hinzufügt.
3. Jeder probabilistische Output zeigt Lauf-Alter + einen Unsicherheits-Hinweis. Dünne Inversionen (<200 m) als möglicherweise unteraufgelöst markieren.
4. Kein neues Farbsystem; nur v1.8-Tokens.

OUTPUT
1. Nerd-Mode-Panel (lazy) + Feinschliff über States/Accessibility/Breakpoints.
2. Finaler Test-Durchlauf; tests.md vollständig; checklist.md komplett abgehakt; plan.md als erledigt markiert.
3. Eine kurze „Atmosphäre — fertig"-Zusammenfassung im Chat: was pro Phase ausgeliefert wurde, bekannte Lücken und vorgeschlagene Follow-ups.

VERIFIKATION & FORTSCHRITT
Führe das vollständige Protokoll als finalen Gesamt-Check aus (alle drei Breakpoints, Accessibility, Lazy-Load bestätigt). Dies ist der letzte Schritt — danach STOP mit der Abschlusszusammenfassung.
```

---

## Optional: übergreifende Leitplanken (in CLAUDE.md einfügen)

```
ATMOSPHÄRE-LEITPLANKEN
- In jeder Aufgabe vor dem Schreiben diagnostizieren; nach dem Schreiben via MCP verifizieren.
- AUTO-FORTSCHRITT: Bei grüner Verifikation automatisch zum nächsten Schritt, ohne Rückfrage. Stop nur bei rotem Check oder einem der drei Entscheidungs-Gates (neue schwere Dependency / Datenbedarf außerhalb bestehender Pipelines / unauflösbarer Design-Konflikt).
- NUR BESTEHENDE DATEN-PIPELINES: ausschließlich vorhandene Datenquellen/-pipelines nutzen (v. a. ICON-D2). Keine neue externe Quelle, kein neuer Fetch-/Ingest-Pfad, kein neuer Fremd-Adapter. Fehlt ein Datum in den vorhandenen Pipelines → Feature reduzieren/ausblenden und STOP, statt eine Pipeline zu bauen.
- VERIFIKATIONS-SUITE: lint + typecheck + test (statisch), Context7 (API-Konsistenz), Chrome DevTools (Laufzeit, alle drei Breakpoints, Perf), GitHub MCP (atomarer Commit + checklist.md).
- Das bestehende v1.8-Design-System und die Konventionen des vorherigen Features adoptieren; nie ein paralleles Styling- oder Datensystem einführen.
- LAYOUT: drei Breakpoints gemäß Layout-Schematik (Mobile / Tablet Hoch- & Querformat / Desktop); Split bei Desktop & Tablet-Querformat, gestapelt sonst; Profil-Cap 0–4000 m mit „ganze Höhe"-Toggle.
- Meter + km/h + lineare Skalen für alle Vertikaldaten. Deutsch für alle nutzersichtbaren Texte; Englisch für Code.
- Meteorologie wird in reinen, getesteten Modulen berechnet; das LLM erklärt nur, rechnet nie.
- Probabilistische Vorhersagen werden als solche gekennzeichnet, mit Modelllauf-Alter; dünne Inversionen als unteraufgelöst markiert.
- 3D-Layer mounten pro Linse und unmounten sauber; Mobil-/Tablet-/WebGPU-Fallbacks erforderlich; Perf via Chrome-DevTools-MCP verifizieren.
- Die Sieben-Datei-Doku nach jeder Phase aktuell halten.
```
