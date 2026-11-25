# GM-10, Schritt 0b — Schlägt Gitter + Gelände das Gitter allein? Methode, eingefroren vor dem ersten gewerteten Lauf

Stand 25.11.2026. Diese Datei wird nach dem Einfrieren nicht mehr geändert; Änderungen kommen als Nachtrag mit eigenem Hash (`gm10b-method-frozen.sha256`). Werkzeug `audit/gletscher-schneemodell/gm10b-combine.mjs` (Modus `score` läuft nur bei passendem Hash dieser Datei; sein eigener Hash steht im Bericht). Urteile rechnet das Werkzeug, nicht der Autor.

**Bekannt beim Einfrieren** (und deshalb keine Vorhersage dieser Runde): alle Zahlen von Schritt 0 (`gm10-diagnose.md` §5; darunter G1-CH 334,8 mm, T3 CH 346,9 mm, Einzelprädiktoren zMed 10,1 % und north 6,2 % / 13,2 % AT, r(x1, zMed) = −0,04 in der Schweiz, −0,58 in Österreich), der synthetische Wiederfindungstest dieser Runde (§7). **Nicht angesehen:** irgendeine Zahl einer Kombination aus x1 und Gelände an den echten Winterbilanzen.

## 1. Daten, Wahrheit, Schmelze, Kennzahl — wie Schritt 0

Unverändert aus `gm10-method-frozen.md` §1, §2 und §5 übernommen und aus `gm10-factor.mjs` importiert (`loadAll`, `predictors`, `lgo`): dieselben Gitter- und Geländedateien, dieselben **32 Schweizer und 8 österreichischen Gletscher** (Gletscher von GM-5b mit x1, d. h. mindestens drei Gitterwintern) mit allen ihren nutzbaren Wintern 2012–2025, derselbe Schmelzkern (`eti`, `TF` 0,12, `SRF` 0,005455), dieselbe **Kennzahl s2** = |T(F) − BW| in mm Wasserwert, gemittelt über die Gletscherwinter, gemeldet **exakt mit dem Kern** (`scoreOf`).

## 2. Kandidaten — genau diese

Jede Form sagt `ln F̂_g = c_Land + Σ β_j · z_jg` voraus, `z` = Prädiktor zentriert und durch die Streuung der TRAININGS-Gletscher geteilt; `c` und `β` **auf der gewerteten Größe s2** angepasst (Nelder–Mead auf der Tabelle, zwei Neustarts; `F̂` an 0,30 / 5,00 gekappt) — die Anpassung von Schritt 0 (`lgo`), unverändert.

| Form | Prädiktoren | Training |
|---|---|---|
| **C1** | x1 + zMed | je Land allein (CH: 31 Gletscher je Durchgang, AT: 7) |
| **C2** | x1 + zMed + north + lnArea (= G1 + T3) | je Land allein |
| Referenz G1 | x1 | je Land allein, neu gerechnet (muss Schritt 0 wiedergeben: CH 334,8, AT 341,1) |
| Referenz T3 | zMed, north, lnArea | die Faktoren je ausgelassenem Gletscher aus dem Bericht von Schritt 0 (CH + AT gemeinsam trainiert), exakt nachgerechnet auf genau diesen 32 bzw. 8 Gletschern |
| Referenz a′, a, b | Landeswert auf s2 (dieselben Trainings-Gletscher wie G1), Landeswert GM-5b (V0), eigener Faktor (V1) | wie Schritt 0 §5 |

**Keine Schrumpfung** zum Landeswert für C1 und C2. Begründung: G1 ist in Schritt 0 ohne Schrumpfung gerechnet; eine Schrumpfung nur bei der Kombination vermischte den Beitrag des Geländes mit dem der Schrumpfung, und die Anpassung auf s2 enthält den Landeswert (β = 0) schon als Möglichkeit. Ein Kandidat, der zu viel anpasst, zahlt dafür im Auslassen eines Gletschers.

## 3. Wertung

- **Ein GLETSCHER ausgelassen** (wie Schritt 0): Zentrierung, Skalierung, `c`, `β` nur aus den anderen Gletschern desselben Landes; alle Winter des ausgelassenen Gletschers exakt mit dem Kern.
- **Gewinn gegen G1** = 1 − s2(C) / s2(G1), beide exakt, dieselben Gletscherwinter.
- **Je Gletscher besser / schlechter als G1:** Mittel von s2 über seine Winter; |Δ| < 0,05 mm zählt als gleich.
- **Geschlossener Anteil der Lücke:** `(a − C) / (a − b)` (wie Schritt 0) und `(G1 − C) / (G1 − b)` (Anteil der nach G1 verbliebenen Lücke).
- **Ziehungen:** 1 000 Ziehungen der Gletscher mit Zurücklegen (Startwert 42), Gewinn gegen G1 je Ziehung; p10.
- **Negativkontrolle:** NUR die hinzugefügten Geländeprädiktoren werden zwischen den Gletschern desselben Landes vertauscht (die ganze Geländezeile eines Gletschers wandert zusammen; x1 bleibt bei seinem Gletscher). (i) Eine Vertauschung (Startwert 42), exakt gewertet wie der Kandidat. (ii) **200 Vertauschungen** (Startwerte 1000 …), Gewinn gegen G1 auf der Tabelle; `p` = (1 + Zahl der Vertauschungen mit Gewinn ≥ beobachtetem Tabellengewinn) / 201.

## 4. Schweiz wird gewertet, Österreich berichtet

Österreich (8 Gletscher, unter der Grenze von 10) bekommt dieselben Zahlen ohne Urteil, dazu die **vorsichtige Variante (E-GM-42)** für G1, C1 und C2: `ln F = 0,5 · ln F̂ + 0,5 · ln F_Land` (F_Land = a′ desselben Durchgangs), dann an [kleinster, größter] **eigener Faktor der Trainings-Gletscher** (`table.Fown` von GM-5b, die sieben anderen) gekappt; exakt gewertet gegen a′ und a; je Gletscher s2 mit Landeswert und mit der vorsichtigen Variante, Zahl der Gletscher, die schlechter werden. Wie viele österreichische Gletscher sich eine SNOWGRID-Zelle teilen, wird aus der Zellendatei der Phase GN gezählt.

## 5. Urteil (vom Werkzeug, nur Schweiz)

Ein Kandidat **„trägt“** nur, wenn alle vier gelten:

1. **Gewinn gegen G1 ≥ 5 %** des Fehlers von G1 (exakt);
2. die **eine Vertauschung** (Startwert 42) gewinnt gegen G1 **weniger als 5 %**;
3. Vertauschungs-`p` ≤ **0,05** (200 Vertauschungen);
4. p10 des Gewinns gegen G1 aus den Ziehungen **> 0**.

Sonst „trägt nicht“. **Wahl:** tragen beide, gewinnt **C1**, außer s2(C2) ≤ s2(C1) − 0,05 · s2(G1). Trägt keiner, bleibt **G1**. Mindestens 10 Gletscher, sonst „nicht entscheidbar“ (Schweiz: 32).

## 6. Q20 Version 1.1 (nebenher)

Version 1.1 (Zenodo-Record 24088217) wird in `C:\dev\buscosun-glacier-cache\gm10\q20-v1.1\` geladen (md5 je Datei gegen den Record) und gegen Version 1.0 + 2 000 m Nordwert an einer Stichprobe bestätigt. Danach werden die Prädiktoren mit Version 1.1 (ohne Verschiebung) neu gerechnet. **Ändert sich ein x1 oder x2 eines gewerteten Gletschers** (über die Rundung von 0,001 hinaus), werden Schritt 0 (`gm10-factor.mjs`, unveränderte Regel) und dieser Schritt auf Version 1.1 wiederholt und beide Fassungen berichtet; das Urteil dieses Schritts kommt aus der Fassung, die zuerst gerechnet wurde (Version 1.0 + 2 000 m), die zweite ist die Gegenprobe.

## 7. Synthetischer Wiederfindungstest (vor dem Einfrieren gelaufen)

Mit den echten Prädiktoren x1 und zMed der 32 Schweizer Gletscher und den echten Tabellen, aber erfundenen Winterbilanzen: je Winter `BW = T(F_wahr · e^ε)`, ε ~ N(0; 0,2) (Startwert 7). Zwei Fälle: **kombiniert** `F_wahr = 1,8 · exp(0,25 · z(x1) + 0,20 · z(zMed))` und **nur Gitter** `F_wahr = 1,8 · exp(0,25 · z(x1))`. Gewertet wie §3 auf der Tabelle, 100 Vertauschungen. Erwartung: kombiniert ⇒ C1 trägt und wird gewählt (C2 nicht vor C1); nur Gitter ⇒ kein Kandidat trägt, kein Gewinn gegen G1. Ergebnis im Diagnosedokument.

## 8. Nicht Teil dieses Schritts

Kein Producer-Code, keine Tabelle für den Runner, kein Producer-Lauf, keine Mutationsrunde, nichts in `buscosun-data` oder `buscosun-archiv`, kein Workflow, kein Push; keine abgeleitete Tabelle je Gletscher im Repo (Lizenzfrage GLAMOS offen) — Werte je Gletscher stehen nur im lokalen Bericht `C:\dev\buscosun-glacier-cache\gm10\report-0b.json`. Deutschland bekommt keine Vorhersage.
