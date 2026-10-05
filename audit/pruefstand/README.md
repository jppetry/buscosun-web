# Prüfstand — Bedienung

Feste Verifikationsroutine für jede Version von buscosun Fusion (Plan: `audit/pruefstand-plan.md`, Protokoll P1 in
`scripts/pruefstand/protokoll/p1/`).

1. **Neue Version prüfen:** im Chat `/pruefe-fusion 10` — registriert die Version (fragt einmal nach dem Freeze-Datum),
   rechnet den Volltest auf der Entwicklungsmenge und schreibt den Bericht.
2. **Abnehmen:** `/pruefe-fusion 10 abnahme` — Selbstprüfung, dann Spur P (Archiv nach dem Freeze, nur reife Wahrheit)
   und Spur R (Hindcast-Tresor), Gates G1–G4, Urteil Champion / Kandidat / abgelehnt, Rangliste.
3. **Mehrere Versionen:** `/pruefe-fusion 5e 6 7 8 9 vergleich` (Entwicklungsmenge) oder mit `tresor` (saubere Mengen,
   wird protokolliert). Der Vergleich entscheidet nichts.
4. **Von Hand** (PowerShell, im Repo, nie mit `2>&1`):
   `node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./scripts/lib/register-ts.mjs scripts/pruefstand/run.mjs --kandidat=fusion-10 --modus=voll`
   — weitere Formen stehen im Kopf von `scripts/pruefstand/run.mjs`; `--modus=status` zeigt Register, Wahrheit und Mengen.
5. **Ergebnisse:** `audit/pruefstand/berichte/<version>/<datum>-<modus>/bericht.html` und `scores.json` (alle Zahlen),
   `audit/pruefstand/vergleiche/<datum>/`, `audit/pruefstand/rangliste.json` (nur die Abnahme schreibt),
   `scripts/pruefstand/register/zugriffe.log` (jede Öffnung von Tresor und Spur P).
6. **Große Daten** liegen außerhalb des Repos in `C:\dev\buscosun-pruefstand\`: Wahrheit W1, Konserven (Vorhersagen je
   Version und Ausgabe), Fälle, Tabellen der Versionen (mit Hash), Worktrees der Commits, Rohdateien der Messnetze.
   Gelesen werden nur `C:\dev\buscosun-archiv`, `C:\dev\buscosun-hindcast` und `C:\dev\buscosun-data`.
7. **Wahrheit:** `scripts/pruefstand/wahrheit/build-w1.mjs` schreibt W1 fort (der Lauf ruft es selbst auf, wenn der
   Stand älter als 20 Stunden ist; `--offline` unterdrückt das). Reife Tage werden nie überschrieben.
8. **Wächter:** `npm run verify:pruefstand` (netzfrei). Daten-Gates: `scripts/pruefstand/wahrheit/rundlauf.mjs`
   (Wahrheit gegen die Echtzeit-Kopie des Archivs) und `scripts/pruefstand/treue.mjs` (Replay gegen gespeicherte Zeilen).
9. **Was nie geht:** Protokoll, Prüfnetz oder Tresor ändern (das Siegel lehnt es ab — eine Änderung ist P2 und alle
   Versionen werden neu bewertet), eine Version mit Ersatztabellen rechnen (der Tabellen-Hash wird geprüft), den Motor
   unter `src/pointForecast/` für den Prüfstand anfassen.
10. **Einzige wiederkehrende Codearbeit:** Ändert eine neue Version die Schnittstelle der Engine, endet der Lauf mit
    Exit-Code 4; dann braucht `scripts/pruefstand/lib/replay.mjs` eine neue Adapter-Generation (`ADAPTER_VERSION`).

Messwerte: Deutscher Wetterdienst (CDC) · GeoSphere Austria (klima-v2-10min, CC BY 4.0) · Source: MeteoSwiss.
