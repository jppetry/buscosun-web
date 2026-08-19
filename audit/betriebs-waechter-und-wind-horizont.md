# audit/betriebs-waechter-und-wind-horizont.md — Diagnose + Ergebnis Phase B1 (V-79 + V-81)

> Stand: 2026-08-03. Auftrag: `improvements.md` V-79 (Betriebs-Wächter) und V-81 (Wind-Fern-Horizont).
> Jans Freigabe zu Beginn: V-79 **nur als unabhängiger `health.yml`** — kein Eingriff in die Warm-Skripte (Cron-Semantik ist STOPP-Zone).

---

## 1 · V-81: Der Wind-Zeitslider verliert stillschweigend 8 Stunden

### 1.1 Der Defekt

`scripts/warm-wind.mjs:144` (vor der Änderung):

```js
if (!FORCE && existing && existing.run === latest.run) {
  log(`Early-Exit: Manifest steht bereits auf Lauf ${latest.run} (kein neuer Lauf).`);
  return 0;
}
```

Geprüft wird **nur der Lauf**, nicht die Step-Abdeckung. ICON-D2 publiziert seine Vorlaufschritte aber **progressiv**: der erste Warm-Tick nach einem neuen Lauf sieht typischerweise nur die Near-Horizon-Steps, die späteren erscheinen über die folgende Stunde. Ab dem zweiten Tick greift der Early-Exit — das Manifest friert auf dem Stand des ersten Ticks ein.

### 1.2 Der Beleg liegt im Repo

`public/latest-wind.json`:

```json
{ "run": "2026072921",
  "runAt":     "2026-07-29T21:00:00.000Z",
  "steps":     [0, 1, 2, 3, 4],
  "updatedAt": "2026-07-29T21:51:22.811Z" }
```

Lauf 21z, geschrieben **51 min nach Referenzzeit**, eingefroren auf **Steps 0–4**. Zum Vergleich derselbe Tick beim 2D-Cron (`latest-grib.json`, gleicher Lauf): `t_2m` 25 Steps, `tot_prec` 28 Steps — dort funktioniert das Nachwärmen.

Der Client übernimmt die Manifest-Liste als autoritativ (`src/wind/iconD2WindSource.ts:340-343`). **Folge: In solchen Fenstern reicht der Wind-Zeitslider 4 statt 12 Stunden voraus — und nichts in der UI sagt es.** Das ist Funktionsverlust, kein Komfortthema.

### 1.3 Die Lösung existierte bereits

`scripts/warm-grib.mjs:246` löst dasselbe Problem korrekt (`manifestCovers`: Lauf **und** Step-Abdeckung je Param). Übernommen, angepasst an das flache `steps[]`-Feld des Wind-Manifests.

### 1.4 Ein Nebeneffekt, der abgesichert werden musste

Weil der Schreibpfad jetzt **auch bei bereits bekanntem Lauf** durchlaufen wird, hätte ein einzelner fehlgeschlagener Fetch das Manifest **schrumpfen** lassen können — der Client hätte Steps verloren, die er vorher hatte. `(Lauf, Step)` ist unveränderlich und liegt nach dem ersten Wärmen im Durable-Cache, bleibt also gültig. Neue reine Funktion `mergeSteps(existing, run, fresh)` führt beide Listen innerhalb desselben Laufs zusammen; bei einem **anderen** Lauf wird nichts übernommen (andere Dateien).

---

## 2 · V-79: Grüne Runs, die nichts beweisen

### 2.1 Der Defekt

Beide Warm-Skripte enden in **jedem** Fail-Safe mit Exit 0 — bewusst, damit ein unvollständiger Lauf das gute alte Manifest nicht zerstört (`warm-grib.mjs:340,351`, `warm-wind.mjs`). Die Kehrseite: **ein dauerhaft blockierter Advance erzeugt lauter grüne Runs.** Niemand prüft, ob das *ausgelieferte* Manifest aktuell ist.

Historischer Beleg: Am 2026-07-22 verbarg genau diese Lücke eine Merge-Regression zwei Tage lang (`audit/layer-transport.md` §J.4.1). In der Strategie-Session vom 2026-07-31 leiteten daraufhin **drei unabhängige Rollen** aus einem veralteten lokalen Klon einen Produktionsausfall ab, den es nicht gab — die GitHub-API zeigte 100/100 erfolgreiche Runs. Nicht der Ausfall war der Befund, sondern dass der Betriebszustand von außen nicht feststellbar ist.

### 2.2 Umsetzung (Jans Variante: nur der unabhängige Wächter)

Neuer Workflow `.github/workflows/health.yml` (stündlich, versetzt zu den Warm-Ticks) ruft `scripts/health-manifests.mjs` und prüft **das ausgelieferte Ergebnis über HTTPS**, wie ein Besucher:

| ID | Prüfung | Schwelle |
|---|---|---|
| H1 | Manifest erreichbar und valides JSON | — |
| H2 | Lauf-Alter (`runAt`) | < 9 h (ICON-D2 läuft alle 3 h) |
| H3 | **Advance-Alter** (`updatedAt`) — der eigentliche V-79-Fall | < 6 h |
| H4 | `warmedThroughProxy` zeigt auf die geprüfte Origin | exakt |
| H5 | Step-Vollständigkeit je Param (lückenlos ab 0) | — |

H4 fängt zwei reale Fehlerbilder ab: einen Cron, der über `localhost` wärmt (füllt einen fremden Cache), und einen, der noch auf die Alt-Domain zeigt (V-02/V-100).
H5 ist die dauerhafte Absicherung gegen genau den V-81-Defekt — eine Lücke in der Step-Liste ist eine fehlende Stunde im Zeitslider.

**Kein Eingriff in die Warm-Skripte oder ihre Workflows.** Kein neuer Dienst, keine Secrets, keine Nutzerdaten (D-02 unberührt). Bei Rot schlägt der Job fehl ⇒ GitHubs Standard-Fehlermail.

---

## 3 · Ergebnis (Gate GB1, 2026-08-03)

| Prüfmittel | Ergebnis |
|---|---|
| `npm run verify:warm-wind` | **13/13 PASS**, netzfrei |
| `npm run verify:health` | **15/15 PASS**, netzfrei |
| `npm run health -- --file public/latest-*.json` | **4 von 8 ROT** — greift sofort (s. unten) |
| `npm run typecheck` | grün |

**Red-Test V-81** (Pflicht nach V-99-Prinzip): `manifestCovers` temporär auf die alte Logik (`return true` nach der Lauf-Prüfung) zurückgesetzt ⇒ **4 Checks rot**, darunter „DER V-81-FALL: gleicher Lauf, nur Steps 0–4 → NACHWÄRMEN", Exit **1**. Zurückgebaut ⇒ 13/13, Exit 0.

**Red-Test V-79:** Der Wächter enthält seine Rot-Fälle als Prüfungen (H1–H5 je mit einem konstruierten Defekt) und ist zusätzlich am echten Arbeitsbaum belegt:

```
❌ latest-grib.json · H2 — Lauf 2026072921 ist 121.5 h alt (Grenze 9 h)
❌ latest-grib.json · H3 — zuletzt umgelegt vor 119.6 h (Grenze 6 h)
❌ latest-wind.json · H2 — Lauf 2026072921 ist 121.5 h alt (Grenze 9 h)
❌ latest-wind.json · H3 — zuletzt umgelegt vor 120.6 h (Grenze 6 h)
```

🔴 **Das ist der Stand des Arbeitsbaums, KEINE Prod-Aussage** — dieselbe Einschränkung wie bei V-20 (Masterplan-Risiko R3). Genau diese Verwechslung war die A3-Fehldiagnose. Die Prod-Aussage entsteht erst, wenn der Workflow gegen `SITE_URL` läuft.

Der Wächter läuft im Workflow **zuerst gegen sich selbst** (`verify:health`), bevor er Produktion prüft — ein Prüfmittel, das nicht rot werden kann, ist gefährlicher als keines (V-91).

### Die fünf Selbstverifikations-Fragen

1. **Funktionserhalt.** Kein App-Code, keine UI berührt. `warm-wind.mjs` behält jedes Verhalten: Discovery, Fail-Safe (Near-Horizon), atomares Schreiben, `FORCE`, `FAIL_STEP`. Verändert wurde ausschließlich die Early-Exit-**Bedingung** (strenger) und die Step-Zusammenführung (additiv). Der Wächter ist rein lesend.
2. **Desktop pixelgleich.** Trifft nicht zu — keine UI-Datei berührt.
3. **Touch-Targets.** Trifft nicht zu.
4. **Konsole sauber.** Trifft nicht zu (kein Browser). Alle vier Skripte laufen warnungsfrei.
5. **Long Tasks.** Trifft nicht zu. Betriebsseitig: Der Wind-Cron wärmt jetzt innerhalb eines Laufs mehrfach nach statt einmal — Mehrkosten sind die neu publizierten Steps, die vorher schlicht **fehlten**. Wer das Volumen senken will, ist bei V-84 (Delta statt Vollauf) richtig, nicht hier.

### 🔴 Offen an Jan

- **Prod-Dispatch ist dein Gate.** `health.yml` läuft erst nach Push auf `main`; `warm-wind.mjs` wirkt erst nach Deploy. Nichts davon ist committet.
- **Repo-Variable `SITE_URL`** muss gesetzt sein (dieselbe wie bei den Warm-Crons) — sonst endet der Wächter mit Exit 2 („nicht lauffähig"), ausdrücklich nicht mit grün.
- **Erwartung beim ersten Lauf:** Der Wächter wird vermutlich **sofort rot**, wenn der Prod-Stand dem lokalen ähnelt. Das ist der Zweck, nicht ein Fehler des Wächters.
- **V-81-Feldverifikation** (aus dem Katalog): zwei aufeinanderfolgende Läufe kurz nach einem neuen DWD-Lauf beobachten — das Manifest muss von 0–4 auf 0–12 wachsen. Netzfrei ist die Logik belegt (13/13), der Feldnachweis braucht Produktion.
