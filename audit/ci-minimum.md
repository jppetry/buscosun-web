# audit/ci-minimum.md — Diagnose + Ergebnis Phase C1 (V-92 + V-39 + V-93)

> Stand: 2026-08-03. Auftrag: `improvements.md` V-92 (Edge Functions außerhalb des Typechecks), V-39 (Performance-Budget als Artefakt), V-93 (CI konkret).
> **Reihenfolge-Bedingung eingehalten (O-02, Risiko R2):** V-91 und V-29 sind in Phase H1 abgeschlossen — die CI zementiert also kein falsches Grün.

---

## 1 · V-92: die sicherheitskritischsten Dateien standen außerhalb des Typechecks

`tsconfig.json` referenzierte zwei Projekte: `tsconfig.app.json` (`include: ["src"]`) und `tsconfig.node.json` (`include: ["vite.config.ts"]`).

`netlify/edge-functions/dwd-grib.ts` und `dwd-wind.ts` lagen damit in **keinem** tsconfig. `npm run typecheck` prüfte ausgerechnet die beiden Bauteile nicht, über die **jedes einzelne Wetterdatenbyte** fließt und die die Pfad-Whitelist gegen Open-Proxy-Missbrauch tragen.

**Umsetzung:** Drittes Projekt `tsconfig.edge.json` (`include: ["netlify/edge-functions"]`, `lib: ["ES2023","DOM"]`, `strict`), in `tsconfig.json` referenziert, damit `tsc -b` es mitzieht.

**Bewusst KEINE Deno-Globals deklariert.** Die Handler nutzen ausschließlich Web-Standard-Globals — genau das macht sie in Node importierbar für `verify-layer-transport.mjs` und `verify-wind-transport.mjs`. Würde jemand ein Deno-Global einführen, soll der Typecheck es **melden**, statt es durchzuwinken.

**Red-Test:** `const __redtest: number = "kein number";` in `dwd-wind.ts` ⇒
`netlify/edge-functions/dwd-wind.ts(111,7): error TS2322`, Exit **2**. Zurückgebaut ⇒ Exit **0**.
Der Typecheck erreicht die Dateien also nachweislich.

---

## 2 · V-39: „schnell" war eine Behauptung ohne Messung

Die Rollup-Warnung „Some chunks are larger than 500 kB" steht seit Monaten im Build-Log und ist dadurch unsichtbar geworden. Ein Bundle-Zuwachs fiel nur auf, wenn jemand zufällig hinsah.

**Umsetzung:** `budget.json` (Artefakt) + `scripts/check-budget.mjs` + `npm run budget`.

Gemessen wird **gzip** (Netlify liefert komprimiert aus), die Rohgröße steht nur zur Information daneben:

| Metrik | was | IST (2026-08-03) | Grenze | Ziel |
|---|---|---|---|---|
| `eagerJs` | Entry + `modulepreload` + Stylesheets aus `dist/index.html` | **123,4 KB** | 129,5 | **90** |
| `eagerCss` | render-blockierendes CSS | 8,1 KB | 8,5 | — |
| `largestChunk` | größter Einzel-Chunk (heute `maplibre-gl`) | 278,4 KB | 292,3 | — |
| `totalJs` | Summe aller Chunks = Deploy-Größe | 801,3 KB | 841,4 | — |

Zwei Entwurfsentscheidungen, die den Unterschied zwischen einem benutzten und einem ignorierten Budget machen:

1. **Lazy-Chunks zählen bei `eagerJs` bewusst nicht mit.** Sie sind der Grund, warum die Startseite trotz zwölf Features klein bleibt; wer sie mitzählte, würde Code-Splitting bestrafen.
2. **`limitKb` ist eine Ratsche, `targetKb` ein Ziel.** Die Grenze steht knapp über dem Ist-Stand und färbt rot; das Ziel (90 KB Eager-JS aus dem Rendering-Audit, erreichbar über V-37) erzeugt nur einen Hinweis. Ein Budget, das am ersten Tag rot ist, wird ignoriert — die Lehre aus V-91.

Der gemessene Wert **123,4 KB** deckt sich mit der unabhängigen Audit-Angabe (122,7 KB).

**Red-Test:** siehe `tests.md` §V-CI.

---

## 3 · V-93: welche Verifier dürfen ins PR-Gate?

Der Katalog nennt „die 12 netzfreien Verifier". Diese Zahl war eine Schätzung. **Empirisch geprüft** am 2026-08-03, indem das globale `fetch` per Node-Preload durch einen werfenden Stub ersetzt und jeder Kandidat damit gefahren wurde:

```
globalThis.fetch = () => { throw new Error('NETZZUGRIFF im netzfreien Lauf'); };
```

Ergebnis: **14 netzfreie npm-Einträge**, alle mit Exit 0 — `verify:seo`, `verify:official-sources`, `verify:datenalter`, `verify:precip-source`, `verify:governor`, `verify:thunder`, `verify:lpi`, `verify:snow`, `verify:rotation`, `verify:warm-wind`, `verify:health`, `fusion:loso`, `fusion:verify` (bündelt vier Skripte), `fusion:desroziers`.

Der naive Weg — `grep -c "fetch("` je Skript — wäre falsch gewesen: die Verifier importieren echte App-Module, die ihrerseits laden. Nur der Laufzeittest ist belastbar.

**Nicht ins PR-Gate, obwohl netzfrei: `fusion:gate`.** Es trainiert für die stationsblockierte Kreuzvalidierung fünfmal über 300+ Sessions (V-29) — das gehört in den Nightly.

**Aufteilung:**

- `ci.yml` (PR + push auf main): `npm ci` → Typecheck (jetzt **drei** Projekte) → Build → `verify:seo` → `budget` → die 14 netzfreien Verifier. Schritte **einzeln benannt**, damit die GitHub-UI sofort sagt, *welcher* umfiel.
- `nightly.yml` (3:00 UTC + Dispatch): 13er-Matrix der netzabhängigen Quellenprüfungen, `fail-fast: false`, plus `fusion:gate` als **nicht blockierender** Befund (`continue-on-error`). Ein Sammel-Job öffnet **ein** Issue statt dreizehn Mails und kommentiert ein bestehendes, statt Duplikate anzulegen.

**Warum die Trennung nicht verhandelbar ist:** buscosun liest DWD-, ECMWF-, Météo-France- und MeteoSchweiz-Bäume über reverse-engineerte Konstanten. Ein DWD-Publikationsfenster oder ein 503 würde `main` rot färben — und rote Gates, an die man sich gewöhnt, sind wertlos.

`fusion:gate` läuft im Nightly ausdrücklich `continue-on-error`: Sein heutiges Exit 1 (t2m/windSpeed out-of-sample schlechter als Gleichgewichtung) ist ein **Befund**, kein Build-Fehler. Constraint C2 bleibt bindend.

Node auf **≥ 22.6** gepinnt (`.nvmrc` = 22.17.0, `engines`) — `--experimental-strip-types` braucht es.

---

## 4 · Ergebnis (Gate GC1, 2026-08-03)

| Prüfung | Ergebnis |
|---|---|
| Edge Functions im Typecheck | ✅ Red-Test: TS2322, Exit 2 → zurückgebaut Exit 0 |
| YAML-Syntax aller drei Workflows | ✅ `js-yaml` parst `ci.yml`, `nightly.yml`, `health.yml` fehlerfrei |
| Netzfreiheit der PR-Gate-Verifier | ✅ 14/14 grün mit gesperrtem `fetch` |
| **Kompletter PR-Gate-Durchlauf lokal** | ✅ **17/17 Schritte grün in 82 Sekunden** |
| `npm run budget` | ✅ alle vier Budgets eingehalten, Ziel-Hinweis bei `eagerJs` |

82 s lokal, ohne `npm ci`. Auf GitHub-Runnern kommen Checkout und Installation dazu; das Ziel aus `masterplan.md` Gate GV1 („PR-Gate grün in < 4 min") ist damit realistisch, aber **erst am echten Runner belegt** — das kann diese Session nicht.

### Die fünf Selbstverifikations-Fragen

1. **Funktionserhalt.** Kein App-Code, kein `src/`. Neu: drei Workflows, zwei Skripte, ein tsconfig, ein Budget-Artefakt, `.nvmrc`, `engines`. Alle bestehenden npm-Einträge unverändert.
2. **Desktop pixelgleich.** Nicht anwendbar — keine UI-Datei berührt.
3. **Touch-Targets.** Nicht anwendbar.
4. **Konsole sauber.** Nicht anwendbar (kein Browser). Alle 17 Gate-Schritte laufen ohne unerwartete Ausgabe.
5. **Long Tasks.** Nicht anwendbar. Laufzeit-Aussage stattdessen oben: 82 s.

### 🔴 Offen an Jan

- **`.github/workflows/*` ist Hochrisiko-Zone.** Die drei Workflows werden erst mit dem Push auf `main` aktiv — **Prod-Dispatch bleibt dein Gate.**
- **ESLint:** bewusst **nicht** eingeführt. V-93 nennt es, aber es wäre eine Dependency-Entscheidung (STOPP & FRAGEN) und hätte ohne vereinbartes Regelwerk hunderte Befunde erzeugt. Gehört in eine eigene Entscheidung.
- **`fusion:gate` im Nightly ist absichtlich nicht blockierend** — bitte bestätigen, dass dir das als Meldeweg reicht, oder ob du es lieber rot haben willst.
