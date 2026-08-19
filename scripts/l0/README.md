# scripts/l0 — Phase L0: Golden-Baseline und Bestandsaufnahme

> **Stand: 2026-08-05.** Werkzeuge für die erste Phase der 2D-Layer-Erweiterung.
> Konzept und Einordnung: `docs/2d-layer-erweiterung.md` §12 · Gate: `checklist.md` §GL0 ·
> Prüfplan: `tests.md` §V-2D-LAYER.
>
> **L0 ist die einzige Phase, die ohne jede Entscheidung starten kann.** Sie ändert keinen
> Produktivcode — sie misst nur und legt das Sicherheitsnetz für den Umbau in L1/L2.

---

## Warum L0 zuerst

Der Registry-Umbau (V-135) ersetzt zwei 48-Zeilen-Duplikate und eine 17-fach verstreute
`moveLayer`-Kette durch eine Sortierung. Genau an dieser Stelle ist schon einmal ein realer
Nutzer-Bug entstanden — „Regen über Belgien/Slowenien", dokumentiert in den Kommentaren um
`MapView.tsx:1136-1148`. Ohne vorher aufgenommene Referenz ist nach dem Umbau **nicht
entscheidbar**, ob eine Abweichung neu ist oder schon immer so war.

Zweitens: Über die Hälfte der Aufwandsschätzung im Umsetzungsplan hängt an einer einzigen Frage —
sendet die Quelle CORS-Header? Ja heißt Aufwand S. Nein heißt Aufwand M **plus**
STOPP-&-FRAGEN, weil `netlify.toml` und die Edge Functions Sperrzone sind (`CLAUDE.md`).
Alle CORS-Angaben in `docs/DATA_SOURCES.md` tragen deshalb ein ⚠️ — sie stammen aus einem
Fremd-Prüfdienst, nicht aus eigener Messung. L0-A ersetzt das durch Zahlen.

---

## Voraussetzungen

- **Node ≥ 22.6** (wie im Repo, `.nvmrc`)
- **Direkter Internetzugang.** Beide Netz-Skripte brechen mit **Exit 2** ab, wenn sie einen
  Firmen-Proxy, ein VPN oder eine Sandbox bemerken. Das ist Absicht: ein einheitlicher 403 über
  zwanzig unabhängige Behördenserver ist praktisch nie echt, und ohne die Sperre entstünden ~20
  Falschbefunde („keine Quelle sendet CORS"). Wenn du diese Meldung siehst, ist nicht die Quelle
  kaputt, sondern dein Netzweg.
- Aus dem **Repo-Root** starten (`node_modules` muss auflösbar sein — `probe-contracts.mjs`
  nutzt `jsfive`, das ohnehin Runtime-Dependency ist; D-06 bleibt unberührt).

Ausgaben landen in `audit/l0/` — das Verzeichnis legen die Skripte selbst an.

---

## L0-A · CORS- und Erreichbarkeits-Bestandsaufnahme (~10 min)

```bash
node scripts/l0/probe-cors.mjs --json audit/l0/cors.json
```

Prüft 20 Endpunkte mit `Origin: https://buscosun.com`, jeweils GET **und** OPTIONS-Preflight,
und stellt das Ergebnis der Behauptung aus `docs/DATA_SOURCES.md` gegenüber. Drei Spalten sind
wichtig:

| Spalte | Bedeutung |
|---|---|
| `ACAO` | der gemessene `access-control-allow-origin` — leer heißt Proxy nötig |
| `Preflight` | Status der OPTIONS-Antwort; relevant, sobald der Client eigene Header setzt (z. B. `If-None-Match` im MeteoSchweiz-304-Pfad) — dann ist es kein Simple Request mehr |
| `Doku` | `bestätigt` / `WIDERSPRUCH` / `neu` — Widersprüche sind der eigentliche Ertrag des Laufs |

**Eingebaute Kontrolle:** `opendata.dwd.de` **muss** ohne CORS antworten. Tut es das nicht, meldet
das Skript das ausdrücklich — dann trennt die Messung entweder nicht sauber, oder der DWD hat CORS
aktiviert. Letzteres wäre ein eigener wertvoller Befund (der `/_dwd_opendata`-Rewrite könnte
perspektivisch entfallen), aber vor dem Feiern zweimal messen.

**Danach:** Widersprüche in `docs/DATA_SOURCES.md` §13 (F-1) und `docs/API.md` §1 eintragen, die
⚠️-Marker durch ✅ ersetzen — und die Aufwandsschätzungen in `docs/2d-layer-erweiterung.md` §13
nachziehen, wo sich Proxy-Bedarf ergeben hat.

> ⚠️ `geosphere-grid` zählt gegen das GeoSphere-Limit von **240 Anfragen pro Stunde und IP**.
> Nicht in einer Schleife laufen lassen.

Optionen: `--strict` (Exit 1, wenn ein als kritisch markierter Endpunkt nicht erreichbar ist) ·
`BUSCOSUN_ORIGIN=…` · `PROBE_TIMEOUT_MS=…`

---

## L0-B · Golden-Baseline (~2–3 h)

### Schritt 1 — Baseline-URLs erzeugen (netzfrei)

```bash
node --experimental-strip-types --import ./scripts/lib/register-ts.mjs \
  scripts/l0/gen-baseline-urls.mjs --base http://localhost:5173 --json audit/l0/baseline-urls.json
```

Erzeugt je Layer eine reproduzierbare `#m=`-Adresse mit **festem Ort und fester Stunde** — ohne
das ist ein Pixel-Diff wertlos, weil schon eine minimal andere Kartenposition alles rot färbt.
Dazu vier Kombinationen, die gezielt die Z-Ordnungs-Kontrakte treffen.

**Nebenertrag: das Permalink-Audit zu V-134.** Statt die modulprivate `LAYER_ORDER` zu
importieren, wird die öffentliche API round-getrippt: `encodeMapState([key])` → `decodeMapState` →
überlebt der Key? Der Lauf gegen den aktuellen Stand liefert:

```
  12/16 permalink-fähig
  ⚠ NICHT permalink-fähig: lightningfc, thunder, snow, rotation
```

Das ist V-134, empirisch statt behauptet. Für diese vier Layer lässt sich die Baseline **nicht**
per URL reproduzieren — sie werden im Protokoll von Hand zugeschaltet. Nach L2 muss derselbe Lauf
`16/16` melden.

### Schritt 2 — Screenshots aufnehmen

Chrome DevTools MCP, beide Viewports, je URL aus Schritt 1:

| Viewport | Maße |
|---|---|
| Desktop | 1440 × 900 |
| Mobil | iPhone 12 Pro, 390 × 844, DPR 3 |

Ablage: `audit/screenshots/l0-baseline/{desktop,mobile}/<id>.png`.
Nach dem Umbau dieselbe Liste erneut nach `…/l0-after/` aufnehmen und diffen.

Vor jeder Aufnahme abwarten, bis der Layer wirklich geladen ist (Status-Chip zeigt eine
Referenzzeit) — sonst diffst du Ladezustände statt Renderergebnisse.

> ⚠️ Die Emulation ist für Layout und Interaktion verlässlich, für **WebGL nicht**. Aussagen zu
> FPS, Partikeldichte oder Texturformat brauchen ein Real-Device (`CLAUDE.md`).

### Schritt 3 — Layer-Matrix aufnehmen

`scripts/l0/capture-layer-matrix.js` läuft **im Browser**, nicht in Node: Inhalt in die
DevTools-Konsole einfügen (oder als MCP-`evaluate` übergeben, oder als DevTools-Snippet ablegen).
Das Ergebnis liegt danach in `window.__buscosunLayerMatrix`, wird ausgegeben und — wenn die
Zwischenablage erlaubt ist — direkt kopiert. Speichern unter
`audit/l0/baseline/<id>.json`.

Die Matrix hält Layer-Reihenfolge, Sichtbarkeit und Typ fest und prüft die drei Erhalt-Kontrakte:

- Wind liegt **über** Grenzen und Beschriftungen (`addLayer(wind)` ohne `beforeId`)
- Stationen liegen **über** der Länder-Maske
- Niederschlag liegt **unter** der Länder-Maske (Depth-Kontrakt — sonst scheint er über die
  Landesgrenze hinaus durch)

**Zum Map-Zugriff:** Die App exportiert die MapLibre-Instanz nicht global, und das ist richtig so.
Das Skript versucht deshalb (1) `window.__buscosunMap`, (2) eine DOM-Suche über die
MapLibre-Container, (3) Rückfall auf Dock-Zustand plus Permalink. Variante 1 liefert die
vollständige Matrix und kostet eine Zeile:

```ts
// src/MapView.tsx, direkt nach `mapRef.current = map;`
if (import.meta.env.DEV) (window as any).__buscosunMap = map;
```

⚠️ **Das ist ein temporäres Diagnosewerkzeug für L0–L2, DEV-only, und gehört nicht in einen
Commit.** Ob es überhaupt eingebaut wird, entscheidet Jan — es ist eine Code-Änderung, auch wenn
sie klein ist. Ohne den Hook greift Variante 2 oder 3; die Baseline ist dann schwächer, aber
vorhanden, und die Screenshots tragen den Hauptteil.

### Schritt 4 — nach dem Umbau vergleichen

```bash
node scripts/verify-layer-matrix.mjs audit/l0/baseline/layer-nowcast.json audit/l0/after/layer-nowcast.json
node scripts/verify-layer-matrix.mjs --dir audit/l0/baseline --dir-after audit/l0/after
```

Netzfrei und deterministisch ⇒ CI-tauglich. Meldet Einfügungen, Entfernungen und **echte**
Verschiebungen (ein Layer, der nur wegen eines eingefügten Nachbarn einen Index weiterrutscht,
ist keine Regression und rauscht nicht mit). Exit 1 bei jeder Abweichung, Exit 2 bei fehlender
Datei.

**Red-Test-Nachweis** (Pflicht nach O-02 — ein Verifier, der nicht fehlschlagen kann, ist kein
Verifier): In einer Kopie der After-Datei zwei Einträge in `layerOrder` vertauschen. Erwartete
Ausgabe:

```
  ✗ RELATIVE REIHENFOLGE GEÄNDERT:
      Position 3: precip-rain-layer  →  country-mask-fill
  ✗ KONTRAKT VERLETZT: Niederschlag unter Maske  (precip@4 mask@3)
  GATE ROT — Abweichungen gefunden.
```
Exit 1. Ergebnis im Gate-Protokoll vermerken.

---

## L0-C · Vertragsproben (~30 min)

```bash
node scripts/l0/probe-contracts.mjs --json audit/l0/contracts.json
node scripts/l0/probe-contracts.mjs warn time          # nur einzelne Blöcke
```

Fünf Blöcke, die zusammen sechs offene Fragen aus `docs/DATA_SOURCES.md` §13 schließen:

| Block | Frage | Was gemessen wird | Wirkung bei negativem Ergebnis |
|---|---|---|---|
| `warn` | **F-4** | `DescribeFeatureType` + ein echtes Feature von `dwd:Warnungen_Gemeinden` | Die Attributliste in `docs/API.md` §3.3 stammt heute aus Fremd-Clients — Abweichungen dort korrigieren, **bevor** L3 startet |
| `time` | **F-5** | TIME-Dimension von `Accumulated_Flash_Area`, `Blitzdichte`, `NCEW_EU` | Fehlt sie beim heute genutzten Layer, ist der Umstieg auf `Blitzdichte` + `mtg_fd:li_afa` bestätigt |
| `hdf5` | **F-2** | ob **`jsfive` die MeteoSchweiz-ODIM-Dateien tatsächlich liest** (RZC, CPC, BZC, MZC) | Der funktionale Test: gelingt `.value`, ist der Filter unterstützt — egal wie er heißt. Scheitert er, kostet L8 zusätzlich 3–5 Tage für einen eigenen Filter-Decoder, und RK-5 wird real |
| `re` | **F-10** | RADVOR-RE: Gitter wirklich 900×900? Header `PR`/`INT`/`VV`? Bit 13 in echten Bytes? | Bestätigt oder widerlegt die Kernannahme für Hagel DE **und** Schneefall DE |
| `konrad` | **F-3** | Elemente und Attribute einer echten KONRAD3D-XML (die **größte** Datei, nicht die jüngste — bei ruhiger Lage sind die jüngsten leer) | Ohne belegte Zellattribute kein Zell-Layer. Raten ist nach D-04 verboten |

Der `hdf5`-Block sucht bei Hagel bewusst auch außerhalb der Saison: Zwischen dem 1. Oktober und
dem 31. März existieren BZC/MZC-Dateien, enthalten aber keine Daten — das Skript sagt das
ausdrücklich, statt es wie einen Fehler aussehen zu lassen. Genau diese Unterscheidung ist RK-7
und der Grund für die Fehler-Taxonomie in V-139.

Für den **Filternamen** (nicht nur „lesbar ja/nein") zusätzlich:
```bash
h5dump -pH <heruntergeladene-datei>.h5 | grep -A3 FILTERS
```

---

## Optional: npm-Aliase

Die Skripte laufen ohne Eintrag in `package.json`. Wer sie dort haben will — `package.json` ist
eine Produktivdatei, die Änderung gehört deshalb in einen bewussten Commit:

```jsonc
"l0:cors":      "node scripts/l0/probe-cors.mjs --json audit/l0/cors.json",
"l0:contracts": "node scripts/l0/probe-contracts.mjs --json audit/l0/contracts.json",
"l0:urls":      "node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/l0/gen-baseline-urls.mjs --json audit/l0/baseline-urls.json",
"verify:layer-matrix": "node scripts/verify-layer-matrix.mjs --dir audit/l0/baseline --dir-after audit/l0/after"
```

Nur `verify:layer-matrix` ist netzfrei und damit CI-tauglich. Die drei `l0:*`-Skripte sind
Diagnosewerkzeuge und dürfen **kein** Gate blockieren — das ist dieselbe Regel, nach der die
netzabhängigen Verifier im Repo behandelt werden.

---

## Gate GL0 — wann L0 fertig ist

- [ ] `probe-cors.mjs` von einem Rechner mit direktem Internetzugang gelaufen; JSON in `audit/l0/`
- [ ] Widersprüche zur Recherche in `docs/DATA_SOURCES.md` §13 und `docs/API.md` §1 eingetragen; ⚠️ → ✅
- [ ] Aufwandsschätzungen in `docs/2d-layer-erweiterung.md` §13 nachgezogen, wo Proxy-Bedarf entstand
- [ ] Baseline-URLs erzeugt; Permalink-Audit protokolliert (erwartet: 12/16)
- [ ] Screenshots aller Layer in beiden Viewports unter `audit/screenshots/l0-baseline/`
- [ ] Layer-Matrizen unter `audit/l0/baseline/`
- [ ] `verify-layer-matrix.mjs` mit **Red-Test-Nachweis** belegt fehlschlagend
- [ ] `probe-contracts.mjs` gelaufen; F-2, F-3, F-4, F-5, F-10 beantwortet oder als weiterhin offen begründet
- [ ] Befunde in `audit/2d-layer-erweiterung-l0.md` zusammengefasst (Diagnose-First, `CLAUDE.md`)
- [ ] Kein Produktivcode geändert — außer, nach Freigabe, der DEV-Hook, der vor L2-Ende wieder verschwindet

Danach entscheidet Jan **O-09** (`decisions.md`), und L1 kann beginnen.
