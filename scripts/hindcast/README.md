# scripts/hindcast — AP10a „Fremdkalibrierung": das lokale Hindcast-Archiv von buscosun Fusion

Baut aus fremden Archiven (Open-Meteo auf AWS S3, dynamical.org, DWD CDC, GeoSphere, MeteoSwiss, IGRA2) ein
Archiv in der Slot-Form des Punkt-Cubes, damit der Fit (`src/point/calibFit.ts`) mit 1,5–3 Jahren Fällen rechnen kann.
Daten liegen in `C:\dev\buscosun-hindcast\` (kein Git-Repo, Quellenvermerke in dessen `README.md`), Code hier.
Provenienz ist immer `hindcast`, nie `measured` (E-F-23). Protokoll und Messwerte: `audit/kalibrierung-fremdarchive.md` §8.

## Aufruf

Alle Node-Skripte aus `C:\dev\buscosun-web` mit
`node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/hindcast/<skript>.mjs` (nicht über
`npm run`, das die `--`-Argumente schluckt; `package.json` bleibt unberührt). Python nur über
`C:\dev\buscosun-hindcast\.venv\Scripts\python.exe` (Python 3.12, `requirements.txt`, E-F-27). Lange Läufe startet
`detach.ps1` losgelöst von der Sitzung (WMI, Priorität BelowNormal); sie überleben das Ende einer Claude-Code-Sitzung.

```
powershell -File scripts/hindcast/detach.ps1 -Name <name> -Command '<bash-Kommando>'   # Log: log\pull-<name>.log
Get-CimInstance Win32_Process | ? { $_.CommandLine -like '*hindcast*' } | % { Stop-Process -Id $_.ProcessId }   # alles anhalten
```

## Stufen

| Schritt | Skript | Was | Wiederaufnahme |
|---|---|---|---|
| 1 Zellen | `cells.mjs` (+ `hsurf_cells.py`) | je Punkt und Stufe der 2×2-Block (E-F-19), je Quelle die Quellzellen nach der Regel des Producers (`lib/grids.mjs`: Blockmittel, Füllung, nächster Punkt, gedrehter Pol für ICON-CH); pinnt `point/static/hmodel/v1` am Index-Commit | deterministisch; `hsurf_cells.py` danach neu, sonst bricht `store.mjs` ab (Hash) |
| 2a Läufe | `pull-data-run.sh <von> <bis>` → `extract_openmeteo.py --route run` | Open-Meteo `data_run/` (ganze Läufe, **3 Monate Aufbewahrung — läuft täglich aus**), ältester Tag zuerst | fertige Dateien werden übersprungen (0 Byte) |
| 2b Tag-0-Reihe | `pull-series.sh` / `queue.mjs series` → `extract_openmeteo.py --route series` | `data/<modell>/<var>/chunk_n.om`, nur die Zellen der Extraktliste (Bereichslesen, nie ganze Dateien) | wachsende Chunks (`complete: false`) werden neu gelesen |
| 2c dynamical | `pull-dynamical.sh` / `queue.mjs dyn` → `extract_dynamical.py` | IFS ENS (51 Member, 00z), AIFS Single, ICON-EU (Icechunk v2) | je (Lauf, Variable) eine Datei |
| 2d Wahrheit | `extract_truth.mjs` | DWD CDC stündlich, GeoSphere `tawes-v1-10min`/`klima-v2-10min`, MeteoSwiss SMN, IGRA2; Zuordnung mit Beweis am Archiv (`--verify`) | Rohdaten und Stationsmonate im Cache; `final`-Tage werden übersprungen |
| 3 Slots | `build-slots.mjs --from --to [--hours] [--tiers]` | Cache → `slots\<Tag>\<HHMM>.json.gz`; Route nach dem DATUM: ab 2026-06-17 `run` (data_run-Fenster), davor `day0` (t1, 00 UTC) bzw. `dyn` (t2/t3) | vorhandene Slots bleiben; **Wächter**: fehlt einem erwarteten Speicher der Tag des benötigten Laufs, wird der Slot nicht geschrieben (Log `skipped: incomplete`) |
| 4 Inventar | `index.mjs` | `index.json` aus dem, was auf der Platte liegt (Slot-Fakten in `index-slots.json` gemerkt) | beliebig oft |
| 5 Abnahme | `rerun-check.mjs`, `cdn-shadow.mjs`, `shadow.mjs`, `verify-hindcast.mjs` | V1–V8 (unten) | beliebig oft |

`queue.mjs <dyn|series|datarun|runslots|preslots|pilot-june>` fasst die Vollläufe zu Ketten zusammen (Node startet Python direkt, ohne Git Bash); `watchdog.ps1` startet jede Kette aus `log\chains.json` neu, bis ihr Log „DONE <modus>“ trägt, und hält den Rechner wach.

## Abnahme V1–V8 (`verify-hindcast.mjs`, jede Prüfung mit Gegenprobe)

1. `node … scripts/hindcast/rerun-check.mjs` — jeder Extraktor noch einmal über einen fertigen Bereich (V7).
2. `node … scripts/hindcast/cdn-shadow.mjs --runs=t3:<00z-Lauf>,t2:<Lauf>…` — Cube-Läufe, die noch am CDN liegen, mit den
   Lesern des Sammlers als Pseudo-Archiv (`shadow\cdn\`); nötig für den exakten σ_ens-Vergleich (dynamical hat nur 00z,
   das Archiv hat je Tag nur den 12z-t3-Lauf).
3. `node … scripts/hindcast/shadow.mjs` — V4 gegen `buscosun-archiv` und `shadow\cdn\`.
4. `node … scripts/hindcast/extract_truth.mjs --verify --verify-from=2026-09-14` — Wahrheit gegen das Archiv (V5).
5. `node … scripts/hindcast/index.mjs`, dann `node … scripts/hindcast/verify-hindcast.mjs [--sample=0.01]` —
   schreibt `verify\<Datum>.json` und stempelt `index.json` (nur ein voller Lauf ohne `--only`/`--slots`).

## Gemessene Kosten (19.09.2026, 4 Kerne, WLAN ≈ 5–6 MB/s, rechengebunden)

| Weg | je Einheit |
|---|---|
| data_run, alle 7 Modelle | ≈ 590 MB Transfer, 8–11 min je Tag und Strom (ICON-D2 allein 320 MB / 56 000 Bereichsanfragen) |
| Tag-0-Reihe, 5 Modelle | ≈ 1,7 GB Transfer und 31 min je 50 Tage |
| dynamical IFS ENS | ≈ 15 MiB je Variable und Lauf, ≈ 14 min je Monat |
| dynamical AIFS | 2,6 MB je Variable und Lauf, ≈ 10 min je Monat |
| Wahrheit | CDC ≈ 100 MB, SMN ≈ 480 MB, TAWES ≈ 25–290 MB je Monatsblock (Pilot 50 Tage: 690 s) |
| Slot Lauf-Route | 4–45 s (t1 allein 4 s, t1+t2+t3 um 00/12 UTC ≈ 40 s), 1–4,6 MiB |
| Slot Tag 0 / dyn | ≈ 7 s (00 UTC mit t2/t3) bzw. ≈ 1 s (dyn t2), 0,4–3,2 MiB |

## Fallen

- Open-Meteo speichert int16 × scale_factor: Druckflächen-Temperatur 0,11–0,15 K, Feuchte 1 %, Schneefallgrenze 10 m —
  der Hindcast trifft den Cube dort nur innerhalb dieser Schranke (V4).
- Tag-0- und dyn-Slots dürfen nie im data_run-Fenster entstehen (ein Pfad je R): die Route hängt am Datum
  (`RUN_WINDOW_FROM`), nie daran, was der Cache gerade hält; `--route` filtert nur.
- Bash-Hintergrundjobs der Sitzung sterben mit ihr („fork: retry") — `detach.ps1` benutzen; auch losgelöste
  Git-Bash-Ketten starben am 19.09. mehrfach still (Log endet bei START) ⇒ lange Ketten mit `-Shell cmd` und
  `queue.mjs`, bewacht von `watchdog.ps1`.
- Der Rechner schläft ohne `watchdog.ps1`/`keep-awake.ps1` (19.09.: 02:22–10:28 Ortszeit stand alles still).
