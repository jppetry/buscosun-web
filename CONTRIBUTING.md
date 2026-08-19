# CONTRIBUTING.md — Arbeitsweise, Gates, Definition of Done

> **Stand: 2026-08-05.** Verbindliche Arbeitsweise für alle Beitragenden — Menschen wie
> Claude-Code-Agenten.
> Grundlagen: `CLAUDE.md` (Verfassung) · `agents.md` (Agent-Teams) · `DEVELOPMENT.md` (Werkzeuge) ·
> `decisions.md` (ADR-Log).

---

## 1. Die sieben harten Regeln

1. **Funktionserhalt ist oberste Direktive.** Keine bestehende Funktion wird entfernt, versteckt
   oder „vereinfacht". Umgruppieren ja, Weglassen nein — Ausnahmen nur mit expliziter Freigabe
   durch Jan.
2. **Diagnose-First.** Diagnose → Plan → Implement → Verify → Gate. **Kein Code vor schriftlicher
   Diagnose** (`audit/<thema>.md`). Gates werden nur mit Beleg abgehakt.
3. **Ein Thema = eine Phase = ein Gate.** Keine zwei Features parallel in einer Session.
4. **Desktop-Regression = Phase fehlgeschlagen.** Mobile-Änderungen nur per Media Query isoliert.
   Breakpoints 767 px / 1439 px — keine Ad-hoc-Werte.
5. **STOPP & FRAGEN** ist eine gültige und erwünschte Ausgabe. Niemals „mutig interpretieren".
6. **Ehrlichkeit vor Vollständigkeit.** Lieber eine belegte Teilantwort als eine plausible
   Vollantwort. Jeder Befund ohne Beleg (`Datei:Zeile`, Screenshot, Verifier-Ausgabe) gilt als
   Behauptung.
7. **Code > Doku.** Bei Widerspruch entscheidet der Code; die Doku wird korrigiert und der Fund in
   `context.md` §Session-Log notiert.

---

## 2. Der Arbeitszyklus

```
Diagnose  →  Plan  →  Implement  →  Verify  →  Gate
```

| Schritt | Ergebnis | Ablage |
|---|---|---|
| **Diagnose** | Ist-Zustand belegt, Ursache benannt, Umfang abgegrenzt | `audit/<thema>.md` |
| **Plan** | Maßnahmen, Reihenfolge, Erhalt-Kontrakte, Risiken | `plan.md` §Aktive Phase |
| **Implement** | Code, minimal-invasiv, flag-gegatet wo neu | — |
| **Verify** | Verifier-Ausgaben, Screenshots, Traces | `tests.md` §V-\<Thema\> |
| **Gate** | die fünf Fragen schriftlich beantwortet | `checklist.md` |

Nach der Phase: `checklist.md` aktualisieren, 3–5-Satz-Fazit in `context.md` §Session-Log,
gefundene Verbesserungen als `V-NN` in `improvements.md`.

---

## 3. Vor jedem Gate: die fünf Selbstverifikations-Fragen

Schriftlich, **jede mit Beleg** (Pfad zu Screenshot, Trace, Konsolenauszug, Verifier-Ausgabe):

1. **Funktionserhalt** — jede bestehende Funktion **einzeln** geprüft?
2. **Desktop pixelgleich**?
3. **Touch-Targets ≥ 44 px**?
4. **Konsole sauber**?
5. **Keine Long Tasks > 200 ms**?

Zusätzlich muss `npm run typecheck` grün sein.

---

## 4. STOPP & FRAGEN (Jan)

Nicht ohne Rückfrage anfassen:

- Shader-/WebGL-Pipeline-Änderungen
- Fusions-Engine
- Löschen von Komponenten
- Dependency-Upgrades oder neue Abhängigkeiten
- Edge Functions, Warm-Crons, Manifest-Mechanik, `netlify.toml`
- alles Irreversible (Prod-Dispatch der Crons ist Jans Gate)
- Zweifel an einer Spezifikation oder einem Schwellenwert (Muster D-19)

**Rückfragen sind billig. Ein falsch kalibrierter Experten-Layer ist teuer.**

---

## 5. Verbesserungs-Pflicht (D-28)

**Jede** gefundene Verbesserung wird als `V-NN`-Eintrag in `improvements.md` festgehalten — auch
wenn sie nicht umgesetzt wird. Kein Befund verschwindet in einem Session-Log.

```markdown
### V-NN · Titel  (Priorität P0–P3 · Aufwand S/M/L · Status offen|geplant|umgesetzt|verworfen)
**Was:** Belegter Ist-Zustand mit `Datei:Zeile`.
**Mehrwert:** Für Jan verständlich — was wird konkret besser, für wen.
**Umsetzung:** Skizze, betroffene Dateien, Risiken, Abhängigkeiten.
**Quelle:** Phase/Session, Datum.
```

Nummern werden **nie** wiederverwendet. Die nächste freie Nummer steht am Ende von
`improvements.md`.

---

## 6. Entscheidungen (ADR)

Grundsatzentscheidungen leben in `decisions.md` als `D-NN`. **Nie überschreiben** — bei einer
Revision wird ein neuer Eintrag mit Verweis auf den alten angelegt.

Offene Fragen laufen als `O-NN` und werden als **Entscheidungsvorlage** aufbereitet: Optionen,
Beleglage, Empfehlung **mit ihren Gegenargumenten**. **Die Entscheidung trifft ausschließlich Jan.**
Nach der Entscheidung wird ein neuer `D-NN` angelegt.

---

## 7. Code-Konventionen

### 7.1 Sprache

| Bereich | Sprache |
|---|---|
| Dokumentation | **Deutsch** |
| Prompts an Claude Code | Englisch |
| Code, Kommentare, Commits | Englisch (Bestand gemischt; Neuanlage Englisch) |

Keine neuen `'de-DE'`-Literale — Formatierung zentralisieren (V-76).

### 7.2 Modulköpfe

Jedes neue Modul beginnt mit einem Kommentar, der beantwortet: **Was** macht das Modul, **warum**
existiert es (statt der naheliegenden Alternative), **welche Quelle** und **welche Konstanten sind
verifiziert — mit Datum**.

Beispiel aus `src/sources/radolan.ts`:
> *„**Quantitatives Feld (verifiziert 2026-05 gegen echte Bytes).** Frühere Annahme, OpenData liefere
> nur eine Binär-Maske, war falsch."*

Das ist der Qualitätsmaßstab: nachvollziehbar, datiert, mit benannter Korrektur.

### 7.3 Purity-Grenze (D-12)

Entscheidungslogik, Mathematik und Zustandsübergänge gehören in **DOM-/WebGL-/netzfreie** Module —
damit sie in Node testbar sind. Vorbild: `src/nowcast/precipSource.ts`.

Jedes solche Modul exportiert ein `verify*()` **und** bekommt ein npm-Skript.
**Ohne npm-Skript zählt der Selbsttest nicht** (V-95).

### 7.4 Near-Zero-Dependencies (D-06)

Sechs Runtime-Abhängigkeiten. Eine siebte ist eine STOPP-&-FRAGEN-Entscheidung, keine
Implementierungsdetail-Frage.

### 7.5 Flag-Gating (D-11, „Rule 2")

Neue Rechenpfade ersetzen alte **nie** direkt. Sie kommen default-off hinter einem Flag mit
benanntem Fallback; alle Flags aus ⇒ byte-identisch zum Bestand. Flags gehen in Cache-Keys ein.

---

## 8. Ehrlichkeitsregeln (D-04) — gate-blockierend

Diese Regeln sind kein Stil, sondern Abnahmekriterien:

1. **Datenalter statt Abrufzeit.** Jede Quelle liefert ihre echte Referenzzeit. Fehlt sie, wird die
   Abrufzeit **als Abrufzeit** beschriftet — nie als Datenstand.
2. **Länder-Lücken ausweisen.** Wo für AT oder CH keine Quelle existiert, sagt die App das und
   verlinkt die zuständige Stelle. „Keine Daten" darf nie wie „keine Gefahr" aussehen.
3. **Messung, Nowcast und Modell nie unmarkiert vermischen.**
4. **Konservative Sprache bei Experten-Layern** (D-19): „Verdacht", „Potenzial", „Hinweis" — nie
   „Warnung", nie „Tornado", nie eine Formulierung, die amtliche Warnprodukte imitiert.
5. **Keine erfundenen Zahlen.** Was nicht gemessen oder belegt ist, wird nicht behauptet — die
   erfundene „78 % Trefferquote" (V-18) ist der Referenzfall.
6. **Keine geratene Semantik.** Ein Produkt wird nicht deshalb „Hagel" genannt, weil sein
   Verzeichnis „hg" heißt. Ohne belegte Definition kein Layer.

---

## 9. Definition of Done

Eine Phase ist fertig, wenn **alle** Punkte belegt sind:

- [ ] `npm run typecheck` grün
- [ ] Alle einschlägigen `npm run verify:*` grün (netzabhängige Ausfälle als solche benannt)
- [ ] Die fünf Selbstverifikations-Fragen schriftlich mit Beleg beantwortet
- [ ] Screenshots Desktop (1440 × 900) **und** iPhone 12 Pro (390 × 844 DPR 3)
- [ ] Keine bestehende Funktion entfernt, versteckt oder verändert (einzeln geprüft)
- [ ] Neue reine Logik hat `verify*()` **und** npm-Skript
- [ ] Neue Quellen sind in `docs/API.md` dokumentiert, mit Lizenz und Attribution
- [ ] Ehrlichkeitsregeln (§8) erfüllt
- [ ] Barrierefreiheit: Bedeutung nicht nur über Farbe, tastaturbedienbar, `prefers-reduced-motion`
- [ ] Gefundene Verbesserungen als `V-NN` erfasst
- [ ] `checklist.md`, `context.md` §Session-Log, ggf. `tests.md` aktualisiert
- [ ] Betroffene Dokumentation aktualisiert (`architecture.md`, `docs/*`)

---

## 10. Parallele Arbeit

Bei mehreren Beitragenden oder Agenten gilt `agents.md`:

- **Ein Agent = ein Zuständigkeitsbereich = klar abgegrenzte Dateien.** Kein zweiter Agent schreibt
  gleichzeitig in denselben Bereich.
- **Dokumente sind der Koordinationskanal**, nicht implizites Wissen.
- **Sperrzonen** (nie parallel): `MapView.tsx` (4.173 LOC), `EventResult.tsx`, `WindLayer.ts`,
  `HistoryPage.tsx`, `meteostatStations.ts`. Diese fünf Dateien halten ~12 % des Codes.

---

## 11. Commits

Conventional Commits, Scope = Feature-/Themenname:

```
feat(map): add hail layer descriptor to layer registry
fix(radolan): correct RE grid dimensions to 900x900
docs(data-sources): add GeoSphere wtype legend from OpenAPI spec
refactor(map): replace duplicated visibility block with layer applier
```

**Keine Commits ohne Auftrag.**
