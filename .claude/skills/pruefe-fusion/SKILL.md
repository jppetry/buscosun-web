---
name: pruefe-fusion
description: Prüft eine Version von buscosun Fusion mit dem festen Prüfstand (Protokoll P1) an realen Stationen gegen den Champion und alle früheren Versionen. Immer verwenden, wenn Jan eine Fusion-Version testen, prüfen, bewerten, vergleichen oder abnehmen will, z. B. "teste die neue buscosun fusion 9 über unsere Prüfroutine", "/pruefe-fusion 9", "ist fusion 9 besser als 8?".
---

# Prüfstand ausführen

Argumente: $ARGUMENTS — Version (z. B. `9` oder `fusion-9`), optional `abnahme` oder `schnell`;
oder mehrere Versionen mit `vergleich` (z. B. `5e 6 7 8 vergleich`), dazu optional `tresor`.
Register: !`node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./scripts/lib/register-ts.mjs scripts/pruefstand/run.mjs --modus=status`

Du bedienst eine feste Routine. Du rechnest keine Maße selbst, änderst kein Protokoll, keine Schwelle, keine Tabelle
und keinen Code unter `src/pointForecast/`. Zahlen kommen nur aus der Ausgabe von `run.mjs` und aus `scores.json`.

Aufruf immer in dieser Form (PowerShell, im Repo, nie mit `2>&1`; `npm run` schluckt die Argumente):
`node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./scripts/lib/register-ts.mjs scripts/pruefstand/run.mjs <Argumente>`
Argumente haben die Form `--name=wert`.

## Ablauf
1. Version auf `fusion-<n>` normalisieren. Archiv-Klon `C:\dev\buscosun-archiv` mit `git pull --ff-only` aktualisieren
   (nur lesen, nichts committen).
2. Register prüfen (`scripts/pruefstand/register/fusion-<n>.json`). Fehlt der Eintrag: `--registriere=fusion-<n>`.
   Endet das mit Exit-Code 2 („FRAGE AN JAN“ — Freeze-Datum oder Fit-Fenster fehlt): Jan fragen, nichts raten, dann mit
   `--freeze=YYYY-MM-DD` (und bei neuen Tabellen `--tabellen=<Ordner> --fit-learned=von..bis --fit-stack=von..bis`) wiederholen.
3. Modus: ohne Zusatz `voll`; `schnell` nur auf ausdrücklichen Wunsch; `abnahme` nur, wenn Jan das Wort nennt.
   Mehrere Versionen nur mit `vergleich`: `--modus=vergleich --versionen=fusion-5e,fusion-6,…`; der Vergleich entscheidet
   nichts und läuft auf der gemeinsamen Entwicklungsmenge. Nur wenn Jan zusätzlich `tresor` sagt: `--tresor` (saubere
   Mengen, wird protokolliert). Die Abnahme öffnet Tresor und Spur P und wird protokolliert. Nie von selbst zur Abnahme
   oder zu `--tresor` wechseln.
4. Ausführen: `… run.mjs --kandidat=fusion-<n> --modus=<modus>`. Ein Lauf kann lange dauern (neue Konserven: etwa
   30 s je Archivtag und Version, etwa 15 s je Tresor-Ausgabe und Version) — im Hintergrund starten und warten.
5. Exit-Code ≠ 0: STOPP. Meldung wörtlich wiedergeben und sagen, was zu tun ist. Keinen Workaround bauen.
   2 = Frage an Jan (Register) · 3 = Selbstprüfung des Prüfstands fehlgeschlagen (die Routine prüfen, nicht den
   Kandidaten) · 4 = Adapter-Vertrag oder Replay (die neue Version hat die Schnittstelle der Engine geändert: der
   Adapter `scripts/pruefstand/lib/replay.mjs` braucht eine neue Generation — das ist die einzige wiederkehrende
   Codearbeit) · 5 = Gate G4 rot · 1 = sonst (Protokoll-Siegel, fehlende Wahrheit, Netz).
6. Antwort im festen Format, Pfad zum Bericht.

## Antwortformat
**Fusion <n> — <Champion | Kandidat | abgelehnt | Volltest>** (Protokoll P1, Wahrheit W<x>, Spur <P/R> bzw. Entwicklungsmenge, <Tage> Tage)
- Fortschrittsindex gegen <Champion>: <±x,x %> (95 %: <a … b>), Nachweisgrenze <y %>
- Gates: G1 <…> · G2 <…> · G3 <…> · G4 <…>
- Drei beste und drei schlechteste Kernzellen (Größe × Fenster × Land, Änderung, Signifikanz)
- Produktaussage: in <k> von <m> Kernzellen besser als jede Einzelquelle
- Warnungen: Überanpassung, unreife Wahrheit, Spur R kontaminiert
- Bericht: <Pfad>

Ist ein Unterschied nicht nachweisbar, das genau so sagen, nicht „besser“ oder „schlechter“. Beim Volltest dazusagen,
dass die Entwicklungsmenge Tage enthält, die die Entwicklung gesehen hat, und dass nur die Abnahme entscheidet.
Bei „Champion“: den Status im Register setzt Jan, nicht der Skill; die Liveschaltung ist ein eigener Schritt.
