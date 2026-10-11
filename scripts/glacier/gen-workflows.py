"""Generates the glacier workflow templates (scripts/glacier/workflow-glacier-*.yml) from shared blocks, so the four data-repo workflows
and the archive workflow cannot drift apart. The templates are committed; edit THIS file and regenerate (verify:glacier-publish W1–W9 read the output).

  python scripts/glacier/gen-workflows.py scripts/glacier
"""
import os, sys

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))

PRODUCER_VAR = "GLACIER_PRODUCER_REF"
DEFAULT_REF = "feat/gletscher"


def producer_step(files, extra_sparse="", title="Checkout producer (buscosun-web, GLACIER_PRODUCER_REF)", comment=""):
    chk = " ".join(files)
    sparse = f"scripts src package.json{extra_sparse}"
    c = f"          {comment}\n" if comment else ""
    return f"""      - name: {title}
        id: app
        run: |
          REF="${{GLACIER_PRODUCER_REF:-{DEFAULT_REF}}}"
          if ! git ls-remote --exit-code --heads https://github.com/jppetry/buscosun-web.git "$REF" >/dev/null 2>&1; then
            # after the merge the feature branch is gone: the producer then lives on main (the file check below idles if it is not there either)
            if [ "$REF" != "main" ] && git ls-remote --exit-code --heads https://github.com/jppetry/buscosun-web.git main >/dev/null 2>&1; then
              echo "Zweig $REF ist weg (gemergt?) — der Producer kommt von main."; REF=main
            else
              echo "producer not on $REF yet (Zweig fehlt in buscosun-web) — Ende ohne Fehler."
              echo "ready=0" >> "$GITHUB_OUTPUT"; exit 0
            fi
          fi
          git clone --depth=1 --quiet --filter=blob:none --no-checkout --branch "$REF" https://github.com/jppetry/buscosun-web.git app
          cd app
{c}          git sparse-checkout set --no-cone {sparse}
          git checkout --quiet
          for f in {chk}; do
            if [ ! -f "$f" ]; then
              echo "producer not on $REF yet ($f fehlt) — Ende ohne Fehler."
              echo "ready=0" >> "$GITHUB_OUTPUT"; exit 0
            fi
          done
          echo "ready=1" >> "$GITHUB_OUTPUT"
"""


DATA_STEP = """      - name: Checkout data (buscosun-data main, glacier/ sparse)
        if: steps.app.outputs.ready == '1'
        uses: actions/checkout@v4
        with:
          ref: main
          path: data
          fetch-depth: 1
          filter: blob:none
          sparse-checkout: glacier
          sparse-checkout-cone-mode: true
"""

# The static builds live on the orphan branch `glacier`; only the build the pointer names is fetched, then one read view is assembled.
VIEW_STEP = """      - name: Static build (branch glacier) and the read view
        id: view
        if: steps.app.outputs.ready == '1'
        run: |
          # The heavy static builds live on the orphan branch `glacier` (contract header, src/glacier/glacierContract.ts); the producers read ONE assembled tree.
          test -f data/glacier/v1/index.json || { echo "glacier/v1/index.json fehlt auf main — die Linie ist noch nicht eingespielt, Ende ohne Fehler."; echo "ready=0" >> "$GITHUB_OUTPUT"; exit 0; }
          BUILD=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('data/glacier/v1/index.json','utf8')).static.build)")
          if ! git ls-remote --exit-code --heads https://github.com/jppetry/buscosun-data.git glacier >/dev/null 2>&1; then
            echo "Zweig glacier fehlt, index.json nennt aber $BUILD — das ist ein Fehler."; exit 1
          fi
          git clone --depth=1 --quiet --filter=blob:none --no-checkout --branch glacier https://github.com/jppetry/buscosun-data.git static-branch
          git -C static-branch sparse-checkout set --no-cone "/glacier/v1/static/$BUILD/"
          git -C static-branch checkout --quiet
          test -d "static-branch/glacier/v1/static/$BUILD" || { echo "index.json nennt den Build $BUILD, aber glacier/v1/static/$BUILD fehlt auf dem Zweig glacier"; exit 1; }
          mkdir -p view/glacier
          cp -r data/glacier/v1 view/glacier/v1
          mkdir -p view/glacier/v1/static
          cp -r static-branch/glacier/v1/static/. view/glacier/v1/static/
          echo "build=$BUILD" >> "$GITHUB_OUTPUT"
          echo "ready=1" >> "$GITHUB_OUTPUT"
"""


def kill_step(text):
    return f"""      - name: Kill switch
        id: kill
        if: steps.app.outputs.ready == '1' && steps.view.outputs.ready == '1'
        run: |
          if [ -f data/glacier/v1/status.json ] && node -e "process.exit(JSON.parse(require('fs').readFileSync('data/glacier/v1/status.json','utf8')).killed===true?0:1)"; then
            echo "{text}"; echo "go=0" >> "$GITHUB_OUTPUT"
          else
            echo "go=1" >> "$GITHUB_OUTPUT"
          fi
"""


def publish_step(line, title, msg):
    return f"""      - name: Publish ({title} — never --force)
        if: steps.{{STEP}}.outputs.wrote != '' && steps.{{STEP}}.outputs.wrote != '0'
        run: |
          cd data
          git config user.name  'buscosun-glacier[bot]'
          git config user.email 'glacier@users.noreply.github.com'
          cd ..
          node app/scripts/glacier/glacier-publish.mjs --repo=data --line={line} --src=out \\
            --index-patch=patch/index-patch.json --status-patch=patch/status-patch.json \\
            --message="glacier({msg}): $(date -u +%Y-%m-%dT%H:%MZ)"
"""


LOCATION = """# VORLAGE. Diese Datei gehört nach `.github/workflows/{name}.yml` im Daten-Repo `jppetry/buscosun-data` (Jans Vollmacht 11.10.2026: Änderungen
# und Pushs in buscosun-data und buscosun-archiv). Die Daten dieser Linie liegen unter `glacier/v1/` — die laufend aufgefrischten Linien auf `main`,
# die schweren statischen Builds auf dem verwaisten Zweig `glacier` (Vertrag `src/glacier/glacierContract.ts`, Kopf). Der Code lebt in
# `buscosun-web` (`scripts/glacier/*`) und wird bei jedem Lauf frisch von `GLACIER_PRODUCER_REF` geklont (Standard `feat/gletscher`; nach dem
# Merge setzt Jan die Repo-Variable `GLACIER_PRODUCER_REF=main`)."""

files = {}

# ---------------------------------------------------------------- static (watcher)
files["static"] = f"""# ============================================================================
# glacier-static.yml — Gletscher-Monitor DACH, statische Linie (Phase GL, buscosun-web/audit/gletscher.md §GL-1)
#
{LOCATION.format(name="glacier-static")}
#
# ── Was dieser Workflow IST ───────────────────────────────────────────────
# Die statische Linie (Inventare, Umrisse, Reihen, amtliche Zahlen) wird NICHT auf dem Runner gebaut: ihre Rohquellen
# (SGI2016, AGI 5, WGMS FoG, GLIMS, GloGEM, Copernicus-DEM-Kacheln) werden einmal von Hand geladen und gegen ihre
# Lizenztexte gelesen (audit/gletscher/licences.md). Gebaut wird lokal (`scripts/glacier/py/build_static.py`), geprüft und
# mit `glacier-publish.mjs --line=static` veröffentlicht (Baum auf den Zweig `glacier`, danach der Zeiger auf `main`).
# Dieser Workflow ist der WÄCHTER der Linie: er prüft wöchentlich den ganzen Baum gegen den Vertrag (Flächenstempel, Länder-
# Summen ±2 %, Umriss-Stufen ±3 %, amtliche Sätze, Zeiger) und wird rot, wenn etwas nicht stimmt. Kein Schreibzugriff auf die Daten.
# (Ein Push auf den verwaisten Zweig löst keinen Workflow aus — die Workflow-Datei muss im gepushten Zweig stehen —, darum der Wochentakt.)
#
# ── Leerlauf ───────────────────────────────────────────────────────────────
# Fehlt der Producer auf dem Zweig oder `glacier/v1/index.json` auf `main`, meldet der Job den Grund und endet grün.
# ============================================================================

name: glacier-static

on:
  schedule:
    - cron: '17 5 * * 1'   # montags 05:17 UTC
  workflow_dispatch: {{}}

concurrency:
  group: glacier-publish
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      GLACIER_PRODUCER_REF: ${{{{ vars.{PRODUCER_VAR} || '{DEFAULT_REF}' }}}}
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: '22'

{producer_step(["scripts/verify-glacier-static.mjs", "scripts/verify-glacier-contract.mjs", "src/glacier/glacierContract.ts"])}
{DATA_STEP}
{VIEW_STEP}
      - name: Pointer and kill switch
        if: steps.app.outputs.ready == '1' && steps.view.outputs.ready == '1'
        run: |
          echo "Build ${{{{ steps.view.outputs.build }}}}"
          if [ -f data/glacier/v1/status.json ]; then node -e "const s=JSON.parse(require('fs').readFileSync('data/glacier/v1/status.json','utf8')); console.log('Kill-Schalter:', s.killed===true ? 'AN — '+(s.killReason||'') : 'aus')"; fi

      - name: Contract and tree checks
        if: steps.app.outputs.ready == '1' && steps.view.outputs.ready == '1'
        run: |
          cd app
          node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-glacier-contract.mjs
          node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-glacier-static.mjs --dir=../view/glacier/v1
"""

# ---------------------------------------------------------------- sat
files["sat"] = f"""# ============================================================================
# glacier-sat.yml — Gletscher-Monitor DACH, Satellitenlinie (Phase GL, buscosun-web/audit/gletscher.md §GL-2)
#
{LOCATION.format(name="glacier-sat")}
#
# ── Ablauf ────────────────────────────────────────────────────────────────
# Zweimal täglich: neue Szenen der letzten 72 h je Kachel suchen (Sentinel-2 L2A über Earth Search STAC, COG-Bereichslesen mit
# `src/fire/detail/cogTiff.ts`, SCL-Maske zuerst), je Gletscher der Klasse A/B rechnen (Schneegrenze nur Klasse A, AAR, Albedo),
# `glacier/v1/obs/<jahr>/<kachel>/<datum>.json` und `glacier/v1/season/<jahr>/<region>/<stand>.json` schreiben, `index.json` (jüngste
# Szene je Kachel) frisch lesen und patchen — alles über `glacier-publish.mjs --line=sat`. Ohne einzige klare Szene schreibt der Lauf
# nichts (kein Stand „heute“ ohne Szene). Gate B2: 14 Tage dieses Workflows im echten Daten-Repo.
#
# Leerlauf: fehlt der Producer auf dem Zweig oder die Linie auf `main`, endet der Job grün mit dem Grund.
# ============================================================================

name: glacier-sat

on:
  schedule:
    - cron: '43 16,22 * * *'   # 16:43 und 22:43 UTC (Plan §7; die Szenen des Vormittags sind dann bei Earth Search angekommen)
  workflow_dispatch: {{}}

concurrency:
  group: glacier-publish
  cancel-in-progress: false

permissions:
  contents: write

jobs:
  sat:
    runs-on: ubuntu-latest
    timeout-minutes: 45
    env:
      GLACIER_PRODUCER_REF: ${{{{ vars.{PRODUCER_VAR} || '{DEFAULT_REF}' }}}}
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: '22'

{producer_step(["scripts/glacier/sat-scan.mjs", "scripts/glacier/lib/satcore.mjs", "scripts/glacier/glacier-publish.mjs", "src/glacier/glacierSatContract.ts"])}
{DATA_STEP}
{VIEW_STEP}
{kill_step("Kill-Schalter AN — keine neuen Szenen.")}
      - name: Scan scenes
        id: scan
        if: steps.app.outputs.ready == '1' && steps.view.outputs.ready == '1' && steps.kill.outputs.go == '1'
        run: |
          cd app
          node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/glacier/sat-scan.mjs --data=../view/glacier/v1 --out=../out --patch=../patch --hours=72 | tee ../scan.log
          echo "wrote=$(test -d ../out && find ../out -type f | wc -l)" >> "$GITHUB_OUTPUT"

{publish_step("sat", "glacier/v1/obs, season, index, status", "sat").replace("{STEP}", "scan")}"""

# ---------------------------------------------------------------- melt
files["melt"] = f"""# ============================================================================
# glacier-melt.yml — Gletscher-Monitor DACH, Schmelzlinie (Phase GL, buscosun-web/audit/gletscher.md §GL-3)
#
{LOCATION.format(name="glacier-melt")}
#
# ── Ablauf ────────────────────────────────────────────────────────────────
# Alle 3 h kurz nach den Cube-Läufen: `point/index.json` raw lesen; nur bei einem neuen Lauf der Stufen t2/t3 rechnen, höchstens
# 4 × täglich (`repeatVerdict`). buscosun Fusion läuft in Node auf dem Cube (`public/climaGrid.json` MUSS im Sparse-Checkout
# stehen; ohne sie bricht der Job ROT ab statt Nullwerte zu schreiben, Lehre V-SW-18). Veröffentlicht werden
# `glacier/v1/melt/<lauf>.json` (Läufe der letzten 72 h) und `glacier/v1/melt/state.json` (Schneezustand für den nächsten Lauf).
# Die Leitgletscher-Zeilen jedes Laufs legt der Workflow `glacier-archiv.yml` im Archiv-Repo ab (ein Workflow dieses Repos darf dort nicht schreiben).
#
# Leerlauf: fehlt der Producer auf dem Zweig oder die Linie auf `main`, endet der Job grün mit dem Grund.
# ============================================================================

name: glacier-melt

on:
  schedule:
    - cron: '20 2,5,8,11,14,17,20,23 * * *'   # 3-stündlich, nach den Cube-Läufen (t1 :40, t2 :30, t3 :55 der Vorstunde)
  workflow_dispatch: {{}}

concurrency:
  group: glacier-publish
  cancel-in-progress: false

permissions:
  contents: write

jobs:
  melt:
    runs-on: ubuntu-latest
    timeout-minutes: 40
    env:
      GLACIER_PRODUCER_REF: ${{{{ vars.{PRODUCER_VAR} || '{DEFAULT_REF}' }}}}
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: '22'

{producer_step(["scripts/glacier/melt.mjs", "scripts/glacier/glacier-publish.mjs", "src/glacier/glacierContract.ts"], extra_sparse=" public/climaGrid.json", comment="# public/climaGrid.json: Klimatologie von buscosun Fusion — ohne sie rechnet der Motor keine Verteilungen (V-SW-18).")}
{DATA_STEP}
{VIEW_STEP}
      - name: Checkout cube (buscosun-data point/, sparse)
        if: steps.app.outputs.ready == '1' && steps.view.outputs.ready == '1'
        run: |
          git clone --depth=1 --quiet --filter=blob:none --no-checkout https://github.com/jppetry/buscosun-data.git cube
          cd cube
          git sparse-checkout set point
          git checkout --quiet

{kill_step("Kill-Schalter AN — kein Schmelzlauf.")}
      - name: Melt run
        id: melt
        if: steps.app.outputs.ready == '1' && steps.view.outputs.ready == '1' && steps.kill.outputs.go == '1'
        run: |
          cd app
          node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/glacier/melt.mjs --data=../view/glacier/v1 --cube=../cube --out=../out --patch=../patch | tee ../melt.log
          # übersprungen (kein neuer Lauf t2/t3, 4 Läufe heute) ⇒ kein Ausgabebaum ⇒ kein Veröffentlichen
          echo "wrote=$(test -d ../out && find ../out -type f | wc -l)" >> "$GITHUB_OUTPUT"

{publish_step("melt", "glacier/v1/melt, index, status", "melt").replace("{STEP}", "melt")}"""

# ---------------------------------------------------------------- feed
files["feed"] = f"""# ============================================================================
# glacier-feed.yml — Gletscher-Monitor DACH, Feed „Was sich verändert hat“ und Wochenkarte (Phase GL, buscosun-web/audit/gletscher.md §GL-5)
#
{LOCATION.format(name="glacier-feed")}
#
# Der Producer `scripts/glacier/feed.mjs` liest den Datenbaum (Szenen, Schmelzlauf, amtliche Meldungen) und schreibt
# `glacier/v1/feed/<Jahr>-W<Woche>.json` (Ereignisse mit stabiler Kennung, Herkunft, Quelle, Zeit; die letzten 12 Wochen bleiben liegen).
# Montags rendert `scripts/glacier/weekly-card.mjs` die drei wichtigsten Änderungen der VORWOCHE als `glacier/v1/card/<Jahr>-W<Woche>.png`
# (1200 × 630, headless Chrome des Runners). Leerlauf: wie bei den anderen Linien.
# ============================================================================

name: glacier-feed

on:
  schedule:
    - cron: '35 5 * * *'   # täglich nach dem Satelliten- und dem Schmelzlauf; montags zusätzlich die Karte der Vorwoche
  workflow_dispatch: {{}}

concurrency:
  group: glacier-publish
  cancel-in-progress: false

permissions:
  contents: write

jobs:
  feed:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      GLACIER_PRODUCER_REF: ${{{{ vars.{PRODUCER_VAR} || '{DEFAULT_REF}' }}}}
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: '22'

{producer_step(["scripts/glacier/feed.mjs", "scripts/glacier/weekly-card.mjs", "scripts/glacier/glacier-publish.mjs", "src/glacier/glacierFeedContract.ts"], comment="# der Feed braucht keine Fusion — nur die Dateien des Datenbaums.")}
{DATA_STEP}
{VIEW_STEP}
{kill_step("Kill-Schalter AN — kein Feed.")}
      - name: Feed (+ Wochenkarte der Vorwoche am Montag)
        id: build
        if: steps.app.outputs.ready == '1' && steps.view.outputs.ready == '1' && steps.kill.outputs.go == '1'
        env:
          OG_CHROME: /usr/bin/google-chrome
        run: |
          cd app
          node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/glacier/feed.mjs --data=../view/glacier/v1 --out=../out --patch=../patch | tee ../feed.log
          if [ "$(date -u +%u)" = "1" ]; then
            node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/glacier/weekly-card.mjs --feed-dir=../out/feed --card-dir=../out/card --week=previous || echo "Karte der Vorwoche: kein Browser oder Fehler — der Feed bleibt unberührt"
          fi
          echo "wrote=$(test -d ../out && find ../out -type f | wc -l)" >> "$GITHUB_OUTPUT"

{publish_step("feed", "glacier/v1/feed, card, index, status", "feed").replace("{STEP}", "build")}"""

# ---------------------------------------------------------------- archiv (lives in buscosun-archiv)
files["archiv"] = f"""# ============================================================================
# glacier-archiv.yml — Ablage der Gletscher-Linie für Gate E (Phase GL, buscosun-web/audit/gletscher.md §GL-3, Archiv)
#
# VORLAGE. Diese Datei gehört nach `.github/workflows/glacier-archiv.yml` im Archiv-Repo `jppetry/buscosun-archiv` (Jans Vollmacht 11.10.2026).
# Der Code lebt in `buscosun-web` (`scripts/glacier/glacier-archive.mjs`), die Daten kommen aus `buscosun-data` `glacier/v1/` (Läufe und Katalog).
# Geschrieben wird nur unter `glacier/v1/<Tag>/`; Punktarchiv, Straßen- und Seewetter daneben bleiben unberührt.
#
# Alle 6 h: die Leitgletscher-Zeilen jedes Schmelzlaufs (`melt-<lauf>.json.gz`) — die Läufe selbst bleiben im Daten-Repo nur 72 h (Gate E: Modell
# gegen Messung im Sommer 2027 braucht die Reihe). Nur Hinzufügen, nie --force, eine Datei mit anderem Inhalt unter demselben Namen bricht ab.
#
# Leerlauf: fehlt das Skript auf dem Zweig oder die Linie im Daten-Repo, endet der Job grün mit dem Grund.
# ============================================================================

name: glacier-archiv

on:
  schedule:
    - cron: '47 */6 * * *'   # alle 6 h, :47 — abseits von road-archiv (:25), sea-archiv (:41) und Punktarchiv (23:10)
  workflow_dispatch: {{}}

concurrency:
  group: glacier-archiv
  cancel-in-progress: false

permissions:
  contents: write

jobs:
  archive:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      GLACIER_PRODUCER_REF: ${{{{ vars.{PRODUCER_VAR} || '{DEFAULT_REF}' }}}}
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: '22'

{producer_step(["scripts/glacier/glacier-archive.mjs", "scripts/glacier/glacier-publish.mjs", "src/glacier/glacierMeltContract.ts"], title="Checkout archiver (buscosun-web, GLACIER_PRODUCER_REF)")}
      - uses: actions/checkout@v4
        if: steps.app.outputs.ready == '1'
        with:
          ref: main
          path: archiv
          fetch-depth: 1
          filter: blob:none
          sparse-checkout: glacier
          sparse-checkout-cone-mode: true

      - name: Checkout glacier store (buscosun-data main glacier/v1 + the catalogue of the static build)
        id: data
        if: steps.app.outputs.ready == '1'
        run: |
          git clone --depth=1 --quiet --filter=blob:none --no-checkout https://github.com/jppetry/buscosun-data.git data
          cd data
          git sparse-checkout set --no-cone /glacier/v1/index.json /glacier/v1/melt/
          git checkout --quiet
          if [ ! -f glacier/v1/index.json ]; then
            echo "glacier/v1/index.json fehlt im Daten-Repo — die Linie ist noch nicht eingespielt, Ende ohne Fehler."
            echo "ready=0" >> "$GITHUB_OUTPUT"; exit 0
          fi
          BUILD=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('glacier/v1/index.json','utf8')).static.build)")
          cd ..
          git clone --depth=1 --quiet --filter=blob:none --no-checkout --branch glacier https://github.com/jppetry/buscosun-data.git static-branch
          git -C static-branch sparse-checkout set --no-cone "/glacier/v1/static/$BUILD/catalog.json"
          git -C static-branch checkout --quiet
          test -f "static-branch/glacier/v1/static/$BUILD/catalog.json" || {{ echo "Katalog des Builds $BUILD fehlt auf dem Zweig glacier"; exit 1; }}
          echo "build=$BUILD" >> "$GITHUB_OUTPUT"
          echo "ready=1" >> "$GITHUB_OUTPUT"

      - name: Archive (lead rows of every melt run)
        id: arch
        if: steps.app.outputs.ready == '1' && steps.data.outputs.ready == '1'
        run: |
          cd app
          node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/glacier/glacier-archive.mjs \\
            --melt=../data/glacier/v1/melt --catalog=../static-branch/glacier/v1/static/${{{{ steps.data.outputs.build }}}}/catalog.json \\
            --archive=../archiv/glacier/v1 --out=../archive-out | tee ../archive.log
          echo "days=$(test -d ../archive-out && ls ../archive-out | wc -l)" >> "$GITHUB_OUTPUT"

      - name: Commit and push (append-only, with retry)
        if: steps.arch.outputs.days != '' && steps.arch.outputs.days != '0'
        run: |
          cd archiv
          git config user.name  'buscosun-glacier-archiv[bot]'
          git config user.email 'glacier-archiv@users.noreply.github.com'
          cd ..
          for DAY in $(ls archive-out); do
            node app/scripts/glacier/glacier-publish.mjs --archive --repo=archiv --src="archive-out/$DAY" --day="$DAY" \\
              --message="glacier: archiv $DAY $(date -u +%H:%MZ)"
          done
"""

names = {"static": "glacier-static", "sat": "glacier-sat", "melt": "glacier-melt", "feed": "glacier-feed", "archiv": "glacier-archiv"}
for k, v in files.items():
    path = os.path.join(OUT, f"workflow-{names[k]}.yml")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(v.rstrip("\n") + "\n")
    print("wrote", path, len(v.splitlines()), "lines")
