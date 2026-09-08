# Monatsarchiv der Repack-Läufe (AR0/AR1)

> **Stand 2026-09-08.** Auftrag von Jan: „ich möchte vielleicht demnächst die Daten von einem Monat im
> buscosun-data Repo speichern" — und, nach der Analyse: „kannst du das ganze umsetzen sodass ab jetzt ein
> Archiv-Zweig aufgesetzt wird. Das würde auch alle anderen Prozesse unangetastet lassen. In dem Archiv-Zweig
> müssen die Daten genauso liegen wie im aktuellen main."
>
> Umgesetzt: `scripts/archive-runs.mjs` hängt jeden Lauf von `main` zusätzlich an `archive-YYYYMM` an —
> gleiche Pfade, gleiche Bytes, gleiche Blob-OIDs, **ohne eine einzige Bilddatei zu laden**.
> Gate GAR1: `verify:archiv` 36/36, Sonde `probe:archiv` 15/15, Live-Probelauf gegen GitHub grün.
> **Offen: der erste echte Push und der einmalige Handpush von `archive.yml` — beides Jans Gate (§7).**

---

## §1 Ausgangslage, gemessen (2026-09-07/08)

Alle Zahlen aus der GitHub-API am echten Repo, nicht geschätzt.

| Größe | Wert |
|---|---|
| `jppetry/buscosun-data`, GitHub-Meldung `size` | 65 527 KB = **64,0 MB** |
| Arbeitsbaum `main` (Summe aller Blobs) | **57,2 MB**, 1 360 Dateien |
| davon 4 Läufe `runs/…` | 52,6 MB (12,71 · 13,15 · 13,33 · 13,42 MB) |
| davon `radar/` (Bilder + Rohbestand, je 12 Slots) | 4,4 MB |
| Commits, erreichbar von `main` | **115**, ältester 2 h 43 min alt (= letzter Publish) |

Ein Lauf trägt **207 Dateien** — und das ist bereits das strukturelle Maximum: die Summe der Horizonte in
`scripts/lib/repackManifest.mjs` (wind 13, temp 25, gust 25, thunder 13, rotation 12, lpi 12, snowdepth 25,
snowfresh 24, precip 28, cape 28) ergibt genau 205 PNG + `index.json` + `repack.json`. Es schwankt nur die
Kompressionsgröße mit dem Wetter (heute snowdepth+snowfresh 0,13 MB; im Winter eher +3–4 MB je Lauf, dafür
cape/thunder/rotation/lpi gegen 0).

**Warum das Repo trotz 1,6 GB Durchsatz in 15 Tagen bei 64 MB steht:** `publish-repack.mjs` baut alle 3 h
eine frische 2-Commit-Historie und force-pusht sie. Der Force-Push ist zugleich der einzige Müllsammler des
Repos — auch für die ~1 000 Radar-Commits pro Tag.

### Monatsarchiv, Größenrechnung

| Variante | pro Lauf | ein Monat (8 Läufe/Tag, 30 d) |
|---|---|---|
| **voll** | 13,15 MB | **3,08 GB** · 240 Läufe · 49 680 Dateien |
| nur 00z + 12z | 13,15 MB | 0,77 GB |
| nur 00z | 13,15 MB | 0,39 GB |
| Schritte 0/3/6/12/24 | 2,80 MB | 0,66 GB |
| nur Analyse t+0 | 0,46 MB | 0,11 GB |

GitHub-Grenzen (Doku, abgerufen 2026-09-07): Repo ideal < 1 GB, „strongly recommended" < 5 GB, On-Disk-
Leistungsgrenze **10 GB**; Einzeldatei Warnung ab 50 MiB, Block ab 100 MiB; ein Push ≤ 2 GB. Größte Datei
heute: 257 KB.

---

## §2 Der Entwurf — und warum nicht einfach `REPACK_KEEP=240`

Ein Monat auf `main` wäre technisch möglich (3,08 GB < 10 GB), scheitert aber an zwei Dingen:

**(a) Drei Stellen laden bei jedem Takt den ganzen Bestand.**

| Stelle | heute | mit einem Monat auf `main` | Takt |
|---|---|---|---|
| `build.yml` → `actions/checkout` (`fetch-depth: 1`) | 57 MB | 3,1 GB | 8×/Tag |
| `publish-repack.mjs:150` → `git clone --depth=1` | 57 MB | 3,1 GB | 8×/Tag |
| `radar.yml` → `actions/checkout` (`fetch-depth: 1`) | 57 MB | 3,1 GB | ~4×/Tag |

≈ 62 GB Downloadverkehr pro Tag, um 107 MB neue Daten abzulegen — und ausgerechnet im Schritt „Publish",
der am 2026-09-04 dreimal gescheitert ist (V-BW-58). Gemessen am letzten erfolgreichen Lauf (Run
34152040190): Checkout 4 s, Publish 21 s, Repack 2 134 s — der Klon ist heute 0,2 % des Jobs, mit einem
Monat wäre er der teuerste Schritt.

**(b) Der Force-Push würde zur einzigen Kopie unwiederbringlicher Daten.** Heute ist Verlust folgenlos: ein
Lauf ist aus DWD-Rohdaten reproduzierbar. Für ein Archiv gilt das **nicht** — opendata.dwd.de hält nur ein
rollierendes 24-h-Fenster. Ein Fehler in der Komponente, die alle 3 h die ganze Historie ersetzt, kostete
dann einen Monat statt zwölf Stunden.

**Deshalb: eigener Monatszweig `archive-YYYYMM` im selben Repo.**

* `main` bleibt **unverändert** — Retention 4, Force-Push, Publisher, Radar-Spiegel, Client: nichts angefasst.
* Der Archivzweig wird **nur angehängt**, nie force-gepusht. Der Publisher kann ihn strukturell nicht anfassen.
* **Ein Checkout von `main` bleibt bei 57 MB**, egal wie groß das Archiv wird — `actions/checkout` holt einen
  Zweig, nicht das Repo. Damit erledigt sich (a) von selbst: alle drei Stellen oben bleiben, wie sie sind.
* Beide Zweige zeigen auf **dieselben Blobs**. Ein archivierter Lauf kostet keinen zusätzlichen Speicher,
  solange er auf `main` liegt; danach hält ihn der Archivzweig am Leben.
* Monatszweige lösen die Rotation gleich mit (§7).

Layout auf dem Archivzweig — wie gefordert identisch zu `main`:

```
runs/<YYYYMMDDHH>/…      alle 207 Dateien, byte- und OID-gleich
hsurf-v1.png             lauf-invariante Orographie, mitgetragen
```

Bewusst **nicht** mitgenommen: `radar/` (eigener Lebenszyklus, 5-Minuten-Takt), `index.json` (nennt Commit
und Läufe von `main` — auf dem Archivzweig wäre er eine Lüge), `README.md`, `.github/`.

---

## §3 AR0 — die Sonde, und was sie gefunden hat

`scripts/probe-archive-branch.mjs` (`npm run probe:archiv`), netzfrei gegen ein Bare-Repo. Sie prüft die
Annahme, auf der alles steht: *ein Schreiber kann Läufe umhängen, ohne die Bilder zu laden.*

**Zwei Fallen, beide erst durch die Messung sichtbar:**

1. **Ein Klon über einen PFAD ignoriert `--filter=blob:none`.** Git nimmt den lokalen Kurzweg und
   hardlinkt/kopiert das ganze Objektlager: gemessen **3,03 statt 0,03 MB**. Nur `file://` (bzw. `https://`)
   verhandelt über `upload-pack`. Aufgefallen ist es nur, weil die Sonde eine **Gegenprobe** trägt
   (`rev-list --missing=print`: 0 statt 54 fehlende Objekte) — die Größenprüfung allein hätte „bestanden"
   gemeldet, obwohl alles geladen wurde. Im Schreiber deckt `remoteUrl()` das ab.
2. **`git read-tree --prefix` lädt die Blobs nach.** Der naheliegende Weg über den Index zog **+3,01 MB von
   3,00 MB Inhalt** — genau das, was vermieden werden sollte, und im Endergebnis unsichtbar (der Push war
   trotzdem 0 KB, weil das Remote die Objekte schon hatte). Erst Messpunkte je Befehl zeigten den Verursacher.
   Der Schreiber baut Bäume deshalb **ohne Index**, direkt mit `git mktree --missing`.

**Ergebnis 15/15**, danach:

```
Blob-loser Klon: 0.03 MB (Inhalt am Remote: 3.00 MB)
  nach rev-parse <tree>:runs/<lauf>  +0 KB
  nach mktree runs/                  +0 KB
  nach commit-tree                   +0 KB
Push: .git 0.03 MB → 0.03 MB (+0 KB)
```

und die zwei Aussagen, auf die es ankommt:

* *(5)* Nach Force-Push auf `main` **und** `gc --prune=now`: der Archivzweig unverändert, die Bilddatei noch
  lesbar — der Zweig hält den Blob.
* *(6)* Ein zweiter Lauf wird **angehängt**, die Historie wächst (2 Commits), nichts wird ersetzt.

**Live gegen GitHub** (Probelauf, kein Push, 2026-09-08):

```
[archiv] Klon 0.06 MB · main führt [2026090806, 2026090809, 2026090812, 2026090815]
[archiv] archive-202609: PROBELAUF — würde 4 Läufe anhängen (Commit d0d88eb, Elter keiner)
```

0,06 MB statt 57 MB — der Partial-Clone wirkt auch über `https://` bei GitHub.

---

## §4 AR1 — was gebaut wurde

| Datei | Rolle |
|---|---|
| `scripts/archive-runs.mjs` | Der Schreiber. Blob-loser Klon → Unterbaum-OIDs → `mktree` → `commit-tree` → Push auf `archive-YYYYMM`. Exportiert `monthOf`, `mergeRuns`, `lostEntries`, `remoteUrl` für den Verifier. |
| `scripts/verify-archiv.mjs` | Gate GAR1, End-to-End gegen ein Bare-Repo (startet den echten Schreiber als Prozess). |
| `scripts/probe-archive-branch.mjs` | Die Messsonde aus §3. |
| `scripts/repack-repo/workflow-archive.yml` | Der Job im Daten-Repo: stündlich, `contents: write`, **kein** Checkout des Daten-Repos. |
| `scripts/repack-repo/README.md` | Abschnitt „Monatsarchiv" — das Repo erklärt sich selbst. |
| `package.json` | `archive`, `verify:archiv`, `probe:archiv`. |

**Sicherungen, alle aus vorhandenen Lehren dieser Linie übernommen:**

* `ls-remote` **vor** allem anderen (Muster aus `publish-repack.mjs` §1): scheitert es, ist der Zustand des
  Remotes unbekannt — dann wird nichts gepusht, statt auf Verdacht.
* **Nie `--force`.** Ein zwischenzeitlicher Push lässt diesen abprallen; der Versuch beginnt neu, mit frisch
  geholtem Elter. Bis zu 4 Versuche — die Lehre aus V-BW-58, wo genau diese Wiederholung fehlt.
* **Verlustwächter** (`lostEntries`) vor jedem Push: der neue Baum muss jeden Eintrag des alten unverändert
  enthalten, sonst Abbruch. Ein Archiv, das schrumpft, ist ein Fehler, kein Ergebnis.
* **Wer zuerst da war, bleibt.** Läge derselbe Lauf mit anderen Bytes auf `main` (Neu-Rechnung), behält das
  Archiv die erste Fassung und **sagt es** — statt still zu überschreiben (V-246-Muster).
* Kein Push auf `main`, kein Schreiben am Producer, keine Änderung an Manifest, Index oder Retention.

**Eine Annahme, benannt statt versteckt:** der Schreiber pusht aus einem *flachen* Klon (`--depth=1`). Dass
GitHub das annimmt, ist hier nicht theoretisch begründet, sondern durch den Nachbarn belegt — der
Radar-Spiegel pusht seit dem 2026-08-29 alle 1–2 min aus einem `actions/checkout`-Baum mit `fetch-depth: 1`
in dasselbe Repo. Der erste Archiv-Commit hat ohnehin keinen Elter, jeder weitere einen, den das Remote
bereits kennt.

---

## §5 Gate GAR1

```
npm run probe:archiv    15/15
npm run verify:archiv   36/36
npm run typecheck       grün
npm run verify:repack   347/347, Exit 0 (Nachbarlinie unberührt)
```

`verify:archiv` prüft in dieser Reihenfolge (Gefährlichkeit absteigend):

1. **Gleichheit** — `ls-tree -r` von `main` und `archive-202609` sind Zeichen für Zeichen identisch; die
   Unterbaum-OID je Lauf ist auf beiden Zweigen dieselbe; `hsurf-v1.png` ist derselbe Blob. Der Zweig trägt
   `runs/` + `hsurf-v1.png` und sonst nichts.
2. **Überleben** — nach Force-Push auf `main` **und** `gc --prune=now` ist das Archiv unverändert und eine
   Bilddatei noch lesbar; Gegenkontrolle, dass die Retention auf `main` wirklich gegriffen hat.
3. **Kein Verlust** — ein Lauf, den `main` fallen gelassen hat, ist im Archiv noch da, während der neue
   dazukommt; die Archiv-Historie wächst (2 Commits), kein Force-Push.
4. **Kein Download** — Arbeitskopie 0,03 MB gegen 1,88 MB Inhalt, plus Gegenprobe über die Promisor-Marken.
5. Monatswechsel, Idempotenz, Konfliktfall, unerreichbares Remote, Quelle ohne `runs/`, sowie fünf
   Quelltext-Verträge (kein `--force`, Elter je Versuch neu, `mktree` statt `read-tree`, blob-los, kein
   Zugriff auf `main`).

Zur Zahl `347/347`: `verify:repack` bildet einen Teil seiner Prüfungen in Schleifen über die Läufe und
Schritte, die es beim DWD **findet** — die Gesamtzahl hängt also vom Zeitpunkt ab und ist mit der in
`CLAUDE.md` notierten 348 nicht direkt vergleichbar. Entscheidend ist: kein Fehlschlag, Exit 0.

Zwei Fehlschläge im ersten Verifier-Lauf waren **Verifier-Fehler**, nicht Produktfehler, und sind benannt:
die Größenprobe griff auf `repack.json` statt auf ein PNG (Git sortiert `r` vor `t`), und die
Quelltextprüfung „kein `read-tree`" stolperte über das Wort im Warnkommentar.

---

## §6 Was sich dadurch ändert — ehrlich benannt

Bisher galt: *das Repo läuft nie voll.* Mit dem Archiv gilt das **nicht mehr** — es ist die bewusst gewählte
Gegenleistung:

| | ohne Archiv | mit Archiv (voll) |
|---|---|---|
| Repo-Größe | stationär ~64 MB | **+107 MB/Tag ≈ 3,1 GB/Monat** |
| 1 GB (ideal) erreicht nach | nie | ~9 Tagen |
| 5 GB („strongly recommended") | nie | ~47 Tagen |
| 10 GB (Leistungsgrenze) | nie | ~93 Tagen |
| Checkout von `main` | 57 MB | **57 MB** (unverändert) |

Das heißt: **spätestens nach etwa drei Monaten** braucht es eine Entscheidung — alte Monatszweige löschen
(Objekte werden unerreichbar und von GitHub geräumt) oder in ein zweites Repo verschieben. Ein
Monatszweig lässt sich mit einem Befehl entfernen, das ist der Grund für den Zuschnitt.

GitHubs Nutzungsregeln (abgerufen 2026-09-07) verbieten „excessive automated bulk activity" und behalten
sich bei „significantly excessive" Bandbreite Drosselung vor. Ruhender Speicher in dieser Größenordnung ist
unauffällig; auffällig würde es, wenn das Archiv über jsDelivr **ausgeliefert** würde. Es wird nicht
ausgeliefert: kein Client-Pfad zeigt darauf.

---

## §7 Offen — Jans Gate

1. **Einmaliger Handpush von `archive.yml`** nach `buscosun-data`. Ein Action-Token darf keine
   Workflow-Datei anlegen; der Push muss mit deinem Benutzer-Token passieren:
   ```
   # in einem Klon von buscosun-data, auf main
   cp <buscosun-web>/scripts/repack-repo/workflow-archive.yml .github/workflows/archive.yml
   git add .github/workflows/archive.yml && git commit -m "ci: Monatsarchiv (AR1)" && git push
   ```
   `publish-repack.mjs` trägt die Datei danach bei jedem Force-Push unverändert weiter.
2. **Erster echter Push** des Archivs — `npm run archive -- --push` von Hand oder der erste Cron-Lauf.
   Er legt `archive-202609` mit den vier Läufen an, die dann auf `main` liegen. Bewusst NICHT von mir
   ausgeführt: ein Push in Produktion ist deine Freigabe.
3. **Zuschnitt** — der Schreiber archiviert derzeit **alles** (3,08 GB/Monat). Sollen es nur 00z+12z
   (0,77 GB) oder nur die Analyse t+0 (0,11 GB) sein, ist das eine Filterzeile; die Entscheidung hängt am
   Zweck (Verifikation der buscosun Fusion / Rückblick-Feature / Vollarchiv).

## §8 Verbesserungen (D-28; `improvements.md` fehlt, deshalb hier)

* **V-AR-1** — `build.yml`-Checkout und der Klon in `publish-repack.mjs` laden weiterhin beide den vollen
  Bestand (2 × 57 MB je Build). Heute 0,2 % des Jobs, also kein Handlungsdruck; der Weg ist erprobt
  (`--filter=blob:none --no-checkout` + `mktree`), falls die Retention auf `main` je wachsen soll.
* **V-AR-2** — `radar.yml` checkt das ganze Repo aus, obwohl der Spiegel nur `radar/` anfasst. Ein
  `sparse-checkout` spart 57 MB je Jobstart (~4×/Tag). Klein, risikoarm, unabhängig vom Archiv.
* **V-AR-3** — Rotation: nach ~3 Monaten muss ein Monatszweig weichen. Vorschlag: ein Schritt im selben
  Job, der Zweige älter als N Monate löscht, mit N als ENV und einer Warnung im Log ab 5 GB Repo-Größe.
* **V-AR-4** — Das Gate erzeugt **kein echtes Push-Rennen** zwischen zwei Schreibern; dagegen steht nur der
  Entwurf (kein `--force`, Elter je Versuch neu). Ein Test mit zwei parallelen Prozessen gegen dasselbe
  Bare-Repo wäre machbar und würde die letzte Annahme dieser Linie schließen.
* **V-AR-5** — **V-BW-58 bleibt der dringendste Posten dieser Linie** und ist vom Archiv unberührt: der
  Publisher pusht einmal ohne Wiederholung. Das Archiv macht ihn nicht gefährlicher (der Zweig ist
  geschützt), aber es macht ihn wichtiger — was `main` nie erreicht, kann auch nicht archiviert werden.
